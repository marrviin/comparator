mod commands;

use commands::folder::{copy_path, diff_dirs, path_kind, trash_path};
use commands::fs::{allow_watch_path, read_text_file, write_text_file};
use commands::git::{git_checkout_file, git_diff_refs, git_repo_info, git_show};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_os::init())
        .invoke_handler(tauri::generate_handler![
            read_text_file,
            write_text_file,
            allow_watch_path,
            diff_dirs,
            copy_path,
            path_kind,
            trash_path,
            git_repo_info,
            git_diff_refs,
            git_show,
            git_checkout_file
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
