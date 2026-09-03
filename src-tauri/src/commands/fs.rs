use std::fs;
use std::path::Path;
use std::time::UNIX_EPOCH;
use tauri::{AppHandle, Runtime};
use tauri_plugin_fs::FsExt;

/// Max file size we will read fully for text diffing (5 MiB).
const MAX_TEXT_SIZE: u64 = 5 * 1024 * 1024;
/// Number of head bytes inspected for binary detection.
const SNIFF_LEN: usize = 8192;

#[derive(serde::Serialize)]
pub struct FileContent {
    /// Decoded UTF-8 text. Empty when `is_binary` is true.
    pub content: String,
    pub is_binary: bool,
    pub size: u64,
    /// Detected source encoding label, e.g. "UTF-8", "GBK".
    pub encoding: String,
    /// True when the file exceeded `MAX_TEXT_SIZE` and `content` was not loaded.
    pub truncated: bool,
    /// Last modification time in milliseconds since the Unix epoch, if available.
    pub modified: Option<u64>,
}

/// Milliseconds since the Unix epoch for a file's last modification time.
pub fn modified_ms(meta: &fs::Metadata) -> Option<u64> {
    meta.modified()
        .ok()
        .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
        .map(|d| d.as_millis() as u64)
}

/// Turn a raw byte blob into a `FileContent` using the same rules as
/// [`read_text_file`]: binary detection on the head, encoding auto-detection
/// (BOM-aware, GBK-capable) with transcoding to UTF-8, and a size cap.
///
/// `size` is the authoritative byte length to report (for `git show` this is
/// `bytes.len()`); `modified` is passed through untouched. Shared by
/// [`read_text_file`] and the git-blob reader so decoding logic lives once.
pub fn decode_bytes(bytes: Vec<u8>, size: u64, modified: Option<u64>) -> FileContent {
    if size > MAX_TEXT_SIZE {
        return FileContent {
            content: String::new(),
            is_binary: false,
            size,
            encoding: String::new(),
            truncated: true,
            modified,
        };
    }

    // Binary detection on the head of the blob.
    let sniff = &bytes[..bytes.len().min(SNIFF_LEN)];
    if content_inspector::inspect(sniff).is_binary() {
        return FileContent {
            content: String::new(),
            is_binary: true,
            size,
            encoding: String::new(),
            truncated: false,
            modified,
        };
    }

    // Encoding detection: respect a BOM if present, otherwise sniff with chardetng.
    // Performance: only feed the first 64KB to the detector (most files declare encoding
    // in the head or are uniform throughout); decoding the full blob with the detected
    // encoding is still done on the entire content, so accuracy is preserved for actual
    // transcoding — this only speeds up the detection phase for multi-MB files.
    let mut detector = chardetng::EncodingDetector::new();
    let sniff_encoding_len = bytes.len().min(64 * 1024);
    detector.feed(
        &bytes[..sniff_encoding_len],
        sniff_encoding_len == bytes.len(),
    );
    let encoding = detector.guess(None, true);
    let (text, actual_encoding, had_errors) = encoding.decode(&bytes);
    let _ = had_errors; // malformed sequences are replaced; still treated as text.

    FileContent {
        content: text.into_owned(),
        is_binary: false,
        size,
        encoding: actual_encoding.name().to_string(),
        truncated: false,
        modified,
    }
}

/// Read a file as text for diffing.
///
/// - Binary files (detected via NUL / control-byte heuristics on the head) are
///   reported with `is_binary = true` and empty `content`.
/// - Encoding is auto-detected (handles UTF-8/16 BOMs and legacy encodings such
///   as GBK) and transcoded to UTF-8.
/// - Files larger than `MAX_TEXT_SIZE` return `truncated = true` with empty
///   `content` to avoid loading huge blobs into the UI.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<FileContent, String> {
    let p = Path::new(&path);
    let meta = fs::metadata(p).map_err(|e| format!("Failed to stat {path}: {e}"))?;
    if !meta.is_file() {
        return Err(format!("Not a file: {path}"));
    }
    let size = meta.len();
    let modified = modified_ms(&meta);

    if size > MAX_TEXT_SIZE {
        return Ok(FileContent {
            content: String::new(),
            is_binary: false,
            size,
            encoding: String::new(),
            truncated: true,
            modified,
        });
    }

    let bytes = fs::read(p).map_err(|e| format!("Failed to read {path}: {e}"))?;
    Ok(decode_bytes(bytes, size, modified))
}

/// Grant the fs plugin's runtime scope access to a single file so the frontend
/// can `watch` it, without opening the capability scope to the whole disk.
///
/// The capability file intentionally declares no static `fs:scope` allow entry;
/// instead each detail view calls this for the file it just opened. The plugin's
/// `watch` command permits a path when either the static scope OR this runtime
/// scope allows it, so allowing exactly the open file is sufficient — and keeps
/// the watch surface as narrow as the currently-viewed files.
///
/// Best-effort: a failure here only means the external-change watcher won't arm,
/// which the frontend already tolerates (silent degrade), so errors are ignored.
#[tauri::command]
pub fn allow_watch_path<R: Runtime>(app: AppHandle<R>, path: String) {
    if let Some(scope) = app.try_fs_scope() {
        let _ = scope.allow_file(&path);
    }
}

// Note: we deliberately do NOT expose a "forbid" counterpart. `forbid_file`
// takes precedence over allow *permanently* (there is no removal API), so
// revoking a path would poison re-opening that same file later. The allowed set
// only accumulates files the user explicitly opened — cheap in-memory patterns —
// so leaving them allowed for the session's lifetime is the correct trade-off.

/// Write UTF-8 text back to a file, overwriting existing content.
///
/// Returns the file's new last-modification time in milliseconds since the Unix
/// epoch (if available) so the UI can refresh its status bar.
#[tauri::command]
pub fn write_text_file(path: String, content: String) -> Result<Option<u64>, String> {
    let p = Path::new(&path);
    fs::write(p, content.as_bytes()).map_err(|e| format!("Failed to write {path}: {e}"))?;
    let meta = fs::metadata(p).map_err(|e| format!("Failed to stat {path}: {e}"))?;
    Ok(modified_ms(&meta))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_plain_utf8() {
        let bytes = "hello 世界".as_bytes().to_vec();
        let size = bytes.len() as u64;
        let out = decode_bytes(bytes, size, None);
        assert!(!out.is_binary);
        assert!(!out.truncated);
        assert_eq!(out.content, "hello 世界");
        assert_eq!(out.size, size);
    }

    #[test]
    fn flags_binary_content() {
        // NUL bytes in the head trigger binary detection.
        let bytes = vec![0x00, 0x01, 0x02, 0xff, b'a', b'b'];
        let size = bytes.len() as u64;
        let out = decode_bytes(bytes, size, None);
        assert!(out.is_binary);
        assert!(out.content.is_empty());
    }

    #[test]
    fn truncates_over_size_cap() {
        // Size is reported as authoritative; anything over the cap is truncated
        // without inspecting the (here empty) byte buffer.
        let out = decode_bytes(Vec::new(), MAX_TEXT_SIZE + 1, None);
        assert!(out.truncated);
        assert!(!out.is_binary);
        assert!(out.content.is_empty());
    }

    #[test]
    fn transcodes_utf16_bom_to_utf8() {
        // UTF-16LE BOM + "Hi" should be detected and transcoded to UTF-8.
        let bytes = vec![0xff, 0xfe, b'H', 0x00, b'i', 0x00];
        let size = bytes.len() as u64;
        let out = decode_bytes(bytes, size, None);
        assert!(!out.is_binary);
        assert_eq!(out.content, "Hi");
        assert_eq!(out.encoding, "UTF-16LE");
    }

    #[test]
    fn preserves_modified_passthrough() {
        let out = decode_bytes(b"x".to_vec(), 1, Some(12345));
        assert_eq!(out.modified, Some(12345));
    }
}
