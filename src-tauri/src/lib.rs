mod reminders;

use std::fs::{self, File};
use std::io::{ErrorKind, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::image::Image;
use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::TrayIconBuilder;
use tauri::{AppHandle, Manager, RunEvent, WebviewUrl, WebviewWindow, WebviewWindowBuilder, WindowEvent, Wry};
use tauri_plugin_dialog::DialogExt;

#[derive(Default)]
pub struct AppState {
  /// The main page listens for reminder clicks (see reminders::take_pending_open).
  page_ready: Mutex<bool>,
  /// A reminder clicked before the page was listening, e.g. one that launched the app.
  pending_open: Mutex<Option<String>>,
  /// The menu bar menu's first line, "3 tasks left today".
  count_item: Mutex<Option<MenuItem<Wry>>>,
}

const TRAY_ID: &str = "desk-garden";
const QUICK_ADD: &str = "quick-add";

/// Anything larger is not a Desk Garden backup.
const MAX_IMPORT_BYTES: u64 = 5 * 1024 * 1024;

/// Every frontend storage key has its own file, so development data never touches production's.
/// Unknown keys are refused rather than turned into paths.
const DATA_FILES: [(&str, &str); 2] = [
  ("desk-garden:v1", "garden.json"),
  ("desk-garden:development:v1", "garden-development.json"),
];

fn data_file(app: &AppHandle, key: &str) -> Result<PathBuf, String> {
  let name = DATA_FILES
    .iter()
    .find(|(k, _)| *k == key)
    .map(|(_, name)| *name)
    .ok_or_else(|| format!("Unknown storage key: {key}"))?;
  Ok(data_dir(app)?.join(name))
}

/// ~/Library/Application Support/<bundle identifier>. Installing, updating or deleting the app
/// leaves this folder alone.
fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
  app.path().app_data_dir().map_err(|e| e.to_string())
}

fn io_error(action: &str, path: &std::path::Path, err: std::io::Error) -> String {
  format!("Could not {action} {}: {err}", path.display())
}

/// The first time each app version starts, it keeps a copy of the data it found. Existing
/// backups are never replaced, so an update can always be rolled back by hand.
fn back_up_existing_data(app: &AppHandle) -> Result<(), String> {
  let dir = data_dir(app)?;
  let version = app.package_info().version.to_string();
  for (_, name) in DATA_FILES {
    let source = dir.join(name);
    if !source.is_file() {
      continue;
    }
    let stem = name.trim_end_matches(".json");
    let target = dir.join("backups").join(format!("{stem}-{version}.json"));
    if target.exists() {
      continue;
    }
    fs::create_dir_all(target.parent().unwrap()).map_err(|e| io_error("create", &target, e))?;
    fs::copy(&source, &target).map_err(|e| io_error("back up to", &target, e))?;
  }
  Ok(())
}

#[tauri::command]
fn load_garden(app: AppHandle, key: String) -> Result<Option<String>, String> {
  let path = data_file(&app, &key)?;
  let contents = match fs::read_to_string(&path) {
    Ok(contents) => contents,
    Err(e) if e.kind() == ErrorKind::NotFound => return Ok(None),
    Err(e) => return Err(io_error("read", &path, e)),
  };
  if serde_json::from_str::<serde_json::Value>(&contents).is_ok() {
    return Ok(Some(contents));
  }
  // Move an unreadable file aside instead of letting the next save replace it.
  let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map_or(0, |d| d.as_secs());
  let aside = path.with_extension(format!("unreadable-{stamp}.json"));
  fs::rename(&path, &aside).map_err(|e| io_error("move aside", &path, e))?;
  eprintln!("Desk Garden: moved unreadable data to {}", aside.display());
  Ok(None)
}

/// Writes to a temporary file and renames it into place, so a crash mid-save never leaves
/// a half-written garden behind.
#[tauri::command]
fn save_garden(app: AppHandle, key: String, contents: String) -> Result<(), String> {
  serde_json::from_str::<serde_json::Value>(&contents).map_err(|e| format!("Refusing to save invalid data: {e}"))?;
  let path = data_file(&app, &key)?;
  let dir = path.parent().unwrap();
  fs::create_dir_all(dir).map_err(|e| io_error("create", dir, e))?;
  let tmp = path.with_extension("json.tmp");
  let mut file = File::create(&tmp).map_err(|e| io_error("create", &tmp, e))?;
  file.write_all(contents.as_bytes()).map_err(|e| io_error("write", &tmp, e))?;
  file.sync_all().map_err(|e| io_error("write", &tmp, e))?;
  fs::rename(&tmp, &path).map_err(|e| io_error("save", &path, e))
}

/// Asks where to save and writes the backup there. Returns false if the user cancels.
#[tauri::command]
async fn export_garden(window: WebviewWindow, file_name: String, contents: String) -> Result<bool, String> {
  let Some(choice) = window
    .dialog()
    .file()
    .set_parent(&window)
    .set_title("Export Desk Garden data")
    .add_filter("Desk Garden backup", &["json"])
    .set_file_name(&file_name)
    .blocking_save_file()
  else {
    return Ok(false);
  };
  let path = choice.into_path().map_err(|e| e.to_string())?;
  fs::write(&path, contents).map_err(|e| io_error("write", &path, e))?;
  Ok(true)
}

/// Asks for a backup file and returns its contents, or None if the user cancels. The frontend
/// validates the contents and decides how to combine them with the current garden.
#[tauri::command]
async fn import_garden(window: WebviewWindow) -> Result<Option<String>, String> {
  let Some(choice) = window
    .dialog()
    .file()
    .set_parent(&window)
    .set_title("Import Desk Garden data")
    .add_filter("Desk Garden backup", &["json"])
    .blocking_pick_file()
  else {
    return Ok(None);
  };
  let path = choice.into_path().map_err(|e| e.to_string())?;
  let size = fs::metadata(&path).map_err(|e| io_error("read", &path, e))?.len();
  if size > MAX_IMPORT_BYTES {
    return Err("That file is too large to be a Desk Garden backup.".into());
  }
  fs::read_to_string(&path).map(Some).map_err(|e| io_error("read", &path, e))
}

/// Brings the main window back, e.g. from the menu bar, the Dock or a reminder.
pub fn show_main(app: &AppHandle) {
  if let Some(window) = app.get_webview_window("main") {
    let _ = window.unminimize();
    let _ = window.show();
    let _ = window.set_focus();
  }
}

/// The menu bar quick-add: a small window running the same frontend, which hands the title to
/// the main window so it's validated and saved exactly like a task added there.
fn show_quick_add(app: &AppHandle) {
  if let Some(window) = app.get_webview_window(QUICK_ADD) {
    let _ = window.center();
    let _ = window.show();
    let _ = window.set_focus();
    return;
  }
  let built = WebviewWindowBuilder::new(app, QUICK_ADD, WebviewUrl::App("index.html".into()))
    .title("Quick Add")
    .inner_size(420.0, 150.0)
    .resizable(false)
    .minimizable(false)
    .maximizable(false)
    .always_on_top(true)
    .skip_taskbar(true)
    .center()
    .focused(true)
    .build();
  match built {
    Ok(window) => {
      let handle = window.clone();
      window.on_window_event(move |event| match event {
        // Like a popover: it goes away when you click elsewhere or close it.
        WindowEvent::Focused(false) => {
          let _ = handle.hide();
        }
        WindowEvent::CloseRequested { api, .. } => {
          api.prevent_close();
          let _ = handle.hide();
        }
        _ => {}
      });
    }
    Err(err) => eprintln!("Desk Garden: could not open quick add: {err}"),
  }
}

#[tauri::command]
fn hide_quick_add(app: AppHandle) {
  if let Some(window) = app.get_webview_window(QUICK_ADD) {
    let _ = window.hide();
  }
}

/// Keeps the menu bar item in step with the app's count of unfinished tasks today.
#[tauri::command]
fn set_tray_count(app: AppHandle, state: tauri::State<'_, AppState>, count: u32) {
  eprintln!("Desk Garden: menu bar count {count}");
  if let Some(tray) = app.tray_by_id(TRAY_ID) {
    let _ = tray.set_title(Some(count.to_string()));
    let tip = match count {
      0 => "Desk Garden: all done for today".to_string(),
      1 => "Desk Garden: 1 task left today".to_string(),
      n => format!("Desk Garden: {n} tasks left today"),
    };
    let _ = tray.set_tooltip(Some(&tip));
  }
  if let Some(item) = state.count_item.lock().unwrap().as_ref() {
    let text = match count {
      0 => "All done for today 🌼".to_string(),
      1 => "1 task left today".to_string(),
      n => format!("{n} tasks left today"),
    };
    let _ = item.set_text(text);
  }
}

fn build_tray(app: &AppHandle) -> tauri::Result<()> {
  let count = MenuItem::with_id(app, "count", "Today’s tasks", false, None::<&str>)?;
  let quick = MenuItem::with_id(app, "quick-add", "Quick Add Task…", true, None::<&str>)?;
  let open = MenuItem::with_id(app, "open", "Open Desk Garden", true, None::<&str>)?;
  let quit = PredefinedMenuItem::quit(app, Some("Quit Desk Garden"))?;
  let menu = Menu::with_items(
    app,
    &[&count, &PredefinedMenuItem::separator(app)?, &quick, &open, &PredefinedMenuItem::separator(app)?, &quit],
  )?;
  *app.state::<AppState>().count_item.lock().unwrap() = Some(count);

  TrayIconBuilder::with_id(TRAY_ID)
    .icon(Image::from_bytes(include_bytes!("../icons/tray.png"))?)
    .icon_as_template(true)
    .tooltip("Desk Garden")
    .menu(&menu)
    .show_menu_on_left_click(true)
    .on_menu_event(|app, event| match event.id().as_ref() {
      "quick-add" => show_quick_add(app),
      "open" => show_main(app),
      _ => {}
    })
    .build(app)?;
  Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let app = tauri::Builder::default()
    .manage(AppState::default())
    .plugin(tauri_plugin_dialog::init())
    .setup(|app| {
      // Reminder clicks can arrive while the app is still launching.
      reminders::init(app.handle());
      if let Err(err) = back_up_existing_data(app.handle()) {
        eprintln!("Desk Garden: {err}");
      }
      build_tray(app.handle())?;
      // Closing the window keeps Desk Garden in the menu bar; Quit (⌘Q or the menu) quits.
      if let Some(main) = app.get_webview_window("main") {
        let handle = main.clone();
        main.on_window_event(move |event| {
          if let WindowEvent::CloseRequested { api, .. } = event {
            api.prevent_close();
            let _ = handle.hide();
          }
        });
      }
      Ok(())
    })
    .invoke_handler(tauri::generate_handler![
      load_garden,
      save_garden,
      export_garden,
      import_garden,
      set_tray_count,
      hide_quick_add,
      reminders::notification_status,
      reminders::request_notification_permission,
      reminders::sync_reminders,
      reminders::clear_delivered_reminders,
      reminders::take_pending_open,
    ])
    .build(tauri::generate_context!())
    .expect("error while building Desk Garden");

  app.run(|app, event| {
    // Clicking the Dock icon while the window is hidden brings it back.
    #[cfg(target_os = "macos")]
    if let RunEvent::Reopen { has_visible_windows: false, .. } = event {
      show_main(app);
    }
    let _ = (app, event);
  });
}
