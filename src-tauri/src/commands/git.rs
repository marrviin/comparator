use std::path::Path;
use std::process::Command;

use crate::commands::fs::{decode_bytes, FileContent};

/// Max commits pulled into the ref picker.
const LOG_LIMIT: usize = 100;
/// Field separator for `git log --pretty` (ASCII unit separator, safe in text).
const SEP: &str = "\x1f";

#[derive(serde::Serialize)]
pub struct GitCommit {
    pub hash: String,
    pub short: String,
    pub subject: String,
    pub author: String,
    pub date: String,
}

#[derive(serde::Serialize)]
pub struct GitRepoInfo {
    pub is_repo: bool,
    pub root: String,
    pub current_branch: String,
    pub branches: Vec<String>,
    pub commits: Vec<GitCommit>,
}

#[derive(serde::Serialize)]
pub struct GitFileDiff {
    pub path: String,
    /// "added" | "modified" | "removed" | "renamed".
    pub status: String,
    /// Blob byte size on each side (None when the file is absent that side).
    pub left_size: Option<u64>,
    pub right_size: Option<u64>,
    /// Modified time on each side, epoch seconds: commit date for a ref side,
    /// file mtime for the working tree (None when absent).
    pub left_mtime: Option<i64>,
    pub right_mtime: Option<i64>,
}

/// Run `git -C <repo> <args...>` and return stdout bytes, or an error carrying
/// stderr. Raw bytes are returned because blob contents are not always UTF-8.
fn run_git(repo: &str, args: &[&str]) -> Result<Vec<u8>, String> {
    let output = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(args)
        .output()
        .map_err(|e| format!("Failed to run git: {e}. Is git installed and on PATH?"))?;
    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!("git {}: {}", args.join(" "), stderr.trim()));
    }
    Ok(output.stdout)
}

/// Convenience wrapper returning trimmed UTF-8 stdout for text-only git calls.
fn run_git_str(repo: &str, args: &[&str]) -> Result<String, String> {
    let bytes = run_git(repo, args)?;
    Ok(String::from_utf8_lossy(&bytes).trim().to_string())
}

/// Probe a directory for a git repo and gather branches + recent commits for
/// the ref pickers. Returns `is_repo = false` (not an error) for non-repos so
/// the UI can show a friendly hint.
#[tauri::command]
pub fn git_repo_info(path: String) -> Result<GitRepoInfo, String> {
    if !Path::new(&path).is_dir() {
        return Err(format!("Not a directory: {path}"));
    }

    // rev-parse fails on a non-repo; treat that as is_repo = false.
    let root = match run_git_str(&path, &["rev-parse", "--show-toplevel"]) {
        Ok(r) if !r.is_empty() => r,
        _ => {
            return Ok(GitRepoInfo {
                is_repo: false,
                root: String::new(),
                current_branch: String::new(),
                branches: Vec::new(),
                commits: Vec::new(),
            });
        }
    };

    let current_branch =
        run_git_str(&root, &["rev-parse", "--abbrev-ref", "HEAD"]).unwrap_or_default();

    let branches = run_git_str(&root, &["branch", "--all", "--format=%(refname:short)"])
        .unwrap_or_default()
        .lines()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty() && !s.contains("HEAD ->"))
        .collect::<Vec<_>>();

    let log_fmt = format!("--pretty=format:%H{SEP}%h{SEP}%s{SEP}%an{SEP}%ad");
    let commits = run_git_str(
        &root,
        &["log", &format!("-n{LOG_LIMIT}"), "--date=short", &log_fmt],
    )
    .unwrap_or_default()
    .lines()
    .filter_map(|line| {
        let parts: Vec<&str> = line.split(SEP).collect();
        if parts.len() < 5 {
            return None;
        }
        Some(GitCommit {
            hash: parts[0].to_string(),
            short: parts[1].to_string(),
            subject: parts[2].to_string(),
            author: parts[3].to_string(),
            date: parts[4].to_string(),
        })
    })
    .collect::<Vec<_>>();

    Ok(GitRepoInfo {
        is_repo: true,
        root,
        current_branch,
        branches,
        commits,
    })
}

/// Resolve blob byte sizes for many object ids in ONE `git cat-file
/// --batch-check` process (instead of one `cat-file -s` spawn per file, which
/// made large diffs spawn hundreds of git processes and stall for seconds).
///
/// Feeds every oid on stdin from a writer thread while `wait_with_output`
/// drains stdout, so a full pipe buffer can't deadlock on big repos. Returns a
/// map keyed by the full oid; missing objects are simply absent.
fn batch_blob_sizes(
    repo: &str,
    oids: &[String],
) -> Result<std::collections::HashMap<String, u64>, String> {
    use std::io::Write;
    let mut map = std::collections::HashMap::new();
    if oids.is_empty() {
        return Ok(map);
    }

    let mut child = Command::new("git")
        .arg("-C")
        .arg(repo)
        .args(["cat-file", "--batch-check"])
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git cat-file: {e}"))?;

    let mut stdin = child.stdin.take().ok_or("git cat-file: no stdin")?;
    let oids_owned = oids.to_vec();
    let writer = std::thread::spawn(move || {
        let mut buf = String::with_capacity(oids_owned.len() * 41);
        for o in &oids_owned {
            buf.push_str(o);
            buf.push('\n');
        }
        let _ = stdin.write_all(buf.as_bytes());
        // stdin dropped here -> git sees EOF and finishes.
    });

    let output = child
        .wait_with_output()
        .map_err(|e| format!("git cat-file: {e}"))?;
    let _ = writer.join();

    let stdout = String::from_utf8_lossy(&output.stdout);
    for line in stdout.lines() {
        // "<oid> <type> <size>" for a blob, or "<oid> missing" when absent.
        let mut it = line.split(' ');
        let oid = match it.next() {
            Some(o) if !o.is_empty() => o,
            _ => continue,
        };
        if let (Some(_ty), Some(size)) = (it.next(), it.next()) {
            if let Ok(n) = size.trim().parse::<u64>() {
                map.insert(oid.to_string(), n);
            }
        }
    }
    Ok(map)
}

/// Working-tree blob size read straight from the filesystem (no git spawn).
fn worktree_size(repo: &str, path: &str) -> Option<u64> {
    std::fs::metadata(Path::new(repo).join(path))
        .ok()
        .map(|m| m.len())
}

/// Working-tree file mtime as epoch seconds (None when absent/unavailable).
fn worktree_mtime(repo: &str, path: &str) -> Option<i64> {
    let full = Path::new(repo).join(path);
    let meta = std::fs::metadata(&full).ok()?;
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
        .map(|d| d.as_secs() as i64)
}

/// Commit timestamp (epoch seconds) of a rev, for the "modified" column on a
/// ref side. Computed once per side by the caller (all files share it).
fn rev_commit_time(repo: &str, rev: &str) -> Option<i64> {
    if rev.is_empty() {
        return None;
    }
    run_git_str(repo, &["show", "-s", "--format=%ct", rev])
        .ok()
        .and_then(|s| s.trim().parse::<i64>().ok())
}

/// Zero-oid sentinel git prints for the working-tree side of a `--raw` diff
/// (the file isn't a committed object, so its size comes from the filesystem).
fn is_null_oid(oid: &str) -> bool {
    oid.chars().all(|c| c == '0')
}

/// One parsed row of `git diff --raw -M` before sizes are resolved.
struct RawDiff {
    status: &'static str,
    path: String,
    on_left: bool,
    on_right: bool,
    /// Blob oid on each side ("" when null/absent -> not a committed object).
    left_oid: String,
    right_oid: String,
}

/// List files that changed between two refs. An empty value on either side
/// stands for the working tree, so the worktree can be picked on EITHER side
/// (not just the right). Uses `--raw -M` so renames collapse to one entry AND
/// each row already carries both blob oids — sizes are then resolved with a
/// SINGLE `git cat-file --batch-check` instead of one `cat-file -s` spawn per
/// file.
#[tauri::command]
pub fn git_diff_refs(repo: String, from: String, to: String) -> Result<Vec<GitFileDiff>, String> {
    let from = from.trim().to_string();
    let to = to.trim().to_string();

    // Both sides being the worktree is the worktree compared with itself:
    // no differences, just return an empty result.
    if from.is_empty() && to.is_empty() {
        return Ok(Vec::new());
    }

    // `git diff` only accepts the worktree as the implicit right side, so when
    // the worktree is picked on the LEFT we diff `<to>` against the worktree
    // and swap every row's sides afterwards (added <-> removed) to put the
    // worktree back on the left. With a ref on both sides, pass both so the
    // comparison is from..to instead of `from` vs the worktree.
    let swap = from.is_empty();
    let mut args: Vec<&str> = vec!["diff", "--raw", "-M", "--no-color", "--abbrev=40"];
    args.push(if swap { &to } else { &from });
    if !swap && !to.is_empty() {
        args.push(&to);
    }
    let out = run_git_str(&repo, &args)?;

    // Display-side refs after the potential swap; the worktree side ("") uses
    // per-file mtime / filesystem size instead of commit data.
    let display_from = if swap { String::new() } else { from.clone() };
    let left_commit_time = rev_commit_time(&repo, &display_from);
    let right_commit_time = rev_commit_time(&repo, &to);

    // Pass 1: parse rows and collect the oids we still need sizes for.
    let mut raws: Vec<RawDiff> = Vec::new();
    let mut wanted: Vec<String> = Vec::new();
    for line in out.lines() {
        // Format: ":<mode_a> <mode_b> <oid_a> <oid_b> <status>\t<path>[\t<path2>]"
        let (meta, rest) = match line.split_once('\t') {
            Some(x) => x,
            None => continue,
        };
        let fields: Vec<&str> = meta.trim_start_matches(':').split(' ').collect();
        if fields.len() < 5 {
            continue;
        }
        let oid_a = fields[2];
        let oid_b = fields[3];
        let code = fields[4];
        let letter = code.chars().next().unwrap_or(' ');
        // Rename/copy carry two tab-separated paths; the new path is the target.
        let path = match letter {
            'R' | 'C' => rest.split_once('\t').map(|(_, new)| new).unwrap_or(rest),
            _ => rest,
        }
        .trim()
        .to_string();
        let status = match letter {
            'A' => "added",
            'D' => "removed",
            'R' => "renamed",
            'C' => "added",
            _ => "modified",
        };
        let on_left = status != "added";
        let on_right = status != "removed";

        let left_oid = if on_left && !is_null_oid(oid_a) {
            wanted.push(oid_a.to_string());
            oid_a.to_string()
        } else {
            String::new()
        };
        let right_oid = if on_right && !is_null_oid(oid_b) {
            wanted.push(oid_b.to_string());
            oid_b.to_string()
        } else {
            String::new()
        };

        raws.push(RawDiff {
            status,
            path,
            on_left,
            on_right,
            left_oid,
            right_oid,
        });
    }

    // Pass 2: one batch call resolves every committed-blob size at once.
    let sizes = batch_blob_sizes(&repo, &wanted).unwrap_or_default();

    // Swap sides when the worktree was the left pick (see comment above).
    if swap {
        for r in &mut raws {
            std::mem::swap(&mut r.left_oid, &mut r.right_oid);
            r.status = match r.status {
                "added" => "removed",
                "removed" => "added",
                other => other,
            };
            r.on_left = r.status != "added";
            r.on_right = r.status != "removed";
        }
    }

    let size_for = |oid: &str, is_worktree: bool, path: &str| -> Option<u64> {
        if !oid.is_empty() {
            sizes.get(oid).copied()
        } else if is_worktree {
            worktree_size(&repo, path)
        } else {
            None
        }
    };
    let mtime_for = |rev: &str, commit_time: Option<i64>, path: &str| {
        if rev.is_empty() {
            worktree_mtime(&repo, path)
        } else {
            commit_time
        }
    };

    let from_worktree = display_from.is_empty();
    let to_worktree = to.is_empty();

    let diffs = raws
        .into_iter()
        .map(|r| GitFileDiff {
            left_size: if r.on_left {
                size_for(&r.left_oid, from_worktree, &r.path)
            } else {
                None
            },
            right_size: if r.on_right {
                size_for(&r.right_oid, to_worktree, &r.path)
            } else {
                None
            },
            left_mtime: if r.on_left {
                mtime_for(&display_from, left_commit_time, &r.path)
            } else {
                None
            },
            right_mtime: if r.on_right {
                mtime_for(&to, right_commit_time, &r.path)
            } else {
                None
            },
            path: r.path,
            status: r.status.to_string(),
        })
        .collect();

    Ok(diffs)
}

/// Restore one path in the working tree from a given revision, i.e. bring the
/// `from` ref's version of a diff row onto disk. Backs the git-compare context
/// menu's "checkout to working tree". An empty `rev` is rejected (the working tree is not a
/// source to check out from). `git checkout <rev> -- <path>` overwrites the
/// working-tree file and stages it, creating parent dirs as needed.
#[tauri::command]
pub fn git_checkout_file(repo: String, rev: String, path: String) -> Result<(), String> {
    if rev.is_empty() {
        return Err("Cannot checkout from the working tree itself".to_string());
    }
    run_git(&repo, &["checkout", &rev, "--", &path])?;
    Ok(())
}

/// Read one file's content at a given revision. An empty `rev` reads the working
/// tree file directly (reusing the fs decode path); otherwise the blob is pulled
/// via `git show <rev>:<path>` and decoded with the same binary/encoding rules.
#[tauri::command]
pub fn git_show(repo: String, rev: String, path: String) -> Result<FileContent, String> {
    if rev.is_empty() {
        // Working-tree side: read the real file so mtime/size are accurate.
        let full = Path::new(&repo).join(&path);
        let meta = std::fs::metadata(&full)
            .map_err(|e| format!("Failed to stat {}: {e}", full.display()))?;
        let modified = crate::commands::fs::modified_ms(&meta);
        let bytes =
            std::fs::read(&full).map_err(|e| format!("Failed to read {}: {e}", full.display()))?;
        let size = bytes.len() as u64;
        return Ok(decode_bytes(bytes, size, modified));
    }

    let spec = format!("{rev}:{path}");
    if path.is_empty() {
        return Err("path cannot be empty".to_string());
    }
    let bytes = run_git(&repo, &["show", &spec])?;
    let size = bytes.len() as u64;
    // A blob has no filesystem mtime; leave it unset.
    Ok(decode_bytes(bytes, size, None))
}
