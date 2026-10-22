//! Task reminders through macOS's UserNotifications framework.
//!
//! Reminders are handed to macOS with a calendar trigger, so the system delivers them on time
//! whether the window is open, closed, or Desk Garden has quit. Clicking one opens (or launches)
//! the app, which then opens the task. Every sync replaces all pending reminders with the list the
//! frontend sends, so rescheduling, completing or deleting a task can't leave a stale or duplicate
//! notification behind.
//!
//! The framework only works for a real .app bundle, so `npm run desktop:dev` (an unbundled binary)
//! reports reminders as unavailable instead of crashing.

use serde::Deserialize;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Deserialize)]
pub struct Reminder {
  id: String,
  title: String,
  body: String,
  /// Local wall-clock time, as computed by the frontend.
  year: i64,
  month: i64,
  day: i64,
  hour: i64,
  minute: i64,
  second: i64,
}

/// Opens the main window on the task behind a clicked reminder. If the page isn't listening yet
/// (the click launched the app), the id waits until the page asks for it.
pub fn open_from_notification(app: &AppHandle, id: String) {
  crate::show_main(app);
  let state = app.state::<crate::AppState>();
  if *state.page_ready.lock().unwrap() {
    let _ = app.emit_to("main", "reminder-open", id);
  } else {
    *state.pending_open.lock().unwrap() = Some(id);
  }
}

#[cfg(target_os = "macos")]
mod imp {
  use super::Reminder;
  use std::sync::OnceLock;
  use std::sync::mpsc;
  use std::time::Duration;

  use block2::RcBlock;
  use objc2::rc::Retained;
  use objc2::runtime::{Bool, NSObject, NSObjectProtocol, ProtocolObject};
  use objc2::{AllocAnyThread, define_class, msg_send};
  use objc2_foundation::{NSArray, NSBundle, NSDateComponents, NSError, NSString};
  use objc2_user_notifications::{
    UNAuthorizationOptions, UNAuthorizationStatus, UNCalendarNotificationTrigger, UNMutableNotificationContent,
    UNNotification, UNNotificationPresentationOptions, UNNotificationRequest, UNNotificationResponse,
    UNNotificationSettings, UNNotificationSound, UNUserNotificationCenter, UNUserNotificationCenterDelegate,
  };
  use tauri::AppHandle;

  static APP: OnceLock<AppHandle> = OnceLock::new();

  /// UserNotifications needs a bundled app; it aborts in an unbundled binary.
  pub fn available() -> bool {
    let bundle = NSBundle::mainBundle();
    bundle.bundleIdentifier().is_some() && bundle.bundlePath().to_string().ends_with(".app")
  }

  fn center() -> Retained<UNUserNotificationCenter> {
    UNUserNotificationCenter::currentNotificationCenter()
  }

  define_class!(
    #[unsafe(super(NSObject))]
    #[name = "DeskGardenNotificationDelegate"]
    struct Delegate;

    unsafe impl NSObjectProtocol for Delegate {}

    unsafe impl UNUserNotificationCenterDelegate for Delegate {
      /// Show reminders even while Desk Garden is the active app.
      #[unsafe(method(userNotificationCenter:willPresentNotification:withCompletionHandler:))]
      fn will_present(
        &self,
        _center: &UNUserNotificationCenter,
        _notification: &UNNotification,
        handler: &block2::DynBlock<dyn Fn(UNNotificationPresentationOptions)>,
      ) {
        handler.call((UNNotificationPresentationOptions::Banner
          | UNNotificationPresentationOptions::List
          | UNNotificationPresentationOptions::Sound,));
      }

      #[unsafe(method(userNotificationCenter:didReceiveNotificationResponse:withCompletionHandler:))]
      fn did_receive(
        &self,
        _center: &UNUserNotificationCenter,
        response: &UNNotificationResponse,
        handler: &block2::DynBlock<dyn Fn()>,
      ) {
        let id = response.notification().request().identifier().to_string();
        if let Some(app) = APP.get() {
          let app = app.clone();
          // Window work belongs on the main thread.
          let main = app.clone();
          let _ = main.run_on_main_thread(move || super::open_from_notification(&app, id));
        }
        handler.call(());
      }
    }
  );

  impl Delegate {
    fn new() -> Retained<Self> {
      let this = Self::alloc().set_ivars(());
      unsafe { msg_send![super(this), init] }
    }
  }

  /// Must run while the app is launching, so a click that launched the app is delivered.
  pub fn init(app: &AppHandle) {
    if !available() {
      return;
    }
    let _ = APP.set(app.clone());
    let delegate = Delegate::new();
    center().setDelegate(Some(ProtocolObject::from_ref(&*delegate)));
    // The center holds its delegate weakly; this one lives as long as the app.
    std::mem::forget(delegate);
  }

  fn status_name(status: UNAuthorizationStatus) -> &'static str {
    match status {
      UNAuthorizationStatus::Authorized | UNAuthorizationStatus::Provisional | UNAuthorizationStatus::Ephemeral => "granted",
      UNAuthorizationStatus::Denied => "denied",
      _ => "default",
    }
  }

  pub fn status() -> &'static str {
    if !available() {
      return "unavailable";
    }
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |settings: std::ptr::NonNull<UNNotificationSettings>| {
      let status = unsafe { settings.as_ref() }.authorizationStatus();
      let _ = tx.send(status_name(status));
    });
    center().getNotificationSettingsWithCompletionHandler(&block);
    rx.recv_timeout(Duration::from_secs(5)).unwrap_or("default")
  }

  /// Shows macOS's permission prompt the first time; afterwards it just reports the answer.
  pub fn request() -> &'static str {
    if !available() {
      return "unavailable";
    }
    let (tx, rx) = mpsc::channel();
    let block = RcBlock::new(move |granted: Bool, _error: *mut NSError| {
      let _ = tx.send(granted.as_bool());
    });
    center().requestAuthorizationWithOptions_completionHandler(
      UNAuthorizationOptions::Alert | UNAuthorizationOptions::Sound,
      &block,
    );
    // The user may take a while to answer the prompt.
    match rx.recv_timeout(Duration::from_secs(300)) {
      Ok(_) => status(),
      Err(_) => "default",
    }
  }

  pub fn sync(reminders: &[Reminder]) -> usize {
    if !available() {
      return 0;
    }
    let center = center();
    center.removeAllPendingNotificationRequests();
    for r in reminders {
      let content = UNMutableNotificationContent::new();
      content.setTitle(&NSString::from_str(&r.title));
      content.setBody(&NSString::from_str(&r.body));
      content.setSound(Some(&UNNotificationSound::defaultSound()));
      content.setThreadIdentifier(&NSString::from_str("desk-garden"));

      // Calendar components without a time zone fire at that wall-clock time in the Mac's
      // current zone, which is what a local reminder means.
      let when = NSDateComponents::new();
      when.setYear(r.year as isize);
      when.setMonth(r.month as isize);
      when.setDay(r.day as isize);
      when.setHour(r.hour as isize);
      when.setMinute(r.minute as isize);
      when.setSecond(r.second as isize);
      let trigger = UNCalendarNotificationTrigger::triggerWithDateMatchingComponents_repeats(&when, false);

      let request = UNNotificationRequest::requestWithIdentifier_content_trigger(
        &NSString::from_str(&r.id),
        &content,
        Some(&trigger),
      );
      let id = r.id.clone();
      let done = RcBlock::new(move |error: *mut NSError| {
        if let Some(error) = unsafe { error.as_ref() } {
          eprintln!("Desk Garden: could not schedule reminder {id}: {}", error.localizedDescription());
        }
      });
      center.addNotificationRequest_withCompletionHandler(&request, Some(&done));
    }
    reminders.len()
  }

  /// Removes already-delivered notifications, e.g. once their task is done or deleted.
  pub fn clear_delivered(ids: &[String]) {
    if !available() || ids.is_empty() {
      return;
    }
    let ids: Vec<Retained<NSString>> = ids.iter().map(|id| NSString::from_str(id)).collect();
    center().removeDeliveredNotificationsWithIdentifiers(&NSArray::from_retained_slice(&ids));
  }
}

#[cfg(not(target_os = "macos"))]
mod imp {
  use super::Reminder;
  use tauri::AppHandle;
  pub fn init(_app: &AppHandle) {}
  pub fn status() -> &'static str {
    "unavailable"
  }
  pub fn request() -> &'static str {
    "unavailable"
  }
  pub fn sync(_reminders: &[Reminder]) -> usize {
    0
  }
  pub fn clear_delivered(_ids: &[String]) {}
}

pub use imp::init;

#[tauri::command]
pub async fn notification_status() -> &'static str {
  tauri::async_runtime::spawn_blocking(imp::status).await.unwrap_or("unavailable")
}

#[tauri::command]
pub async fn request_notification_permission() -> &'static str {
  tauri::async_runtime::spawn_blocking(imp::request).await.unwrap_or("unavailable")
}

#[tauri::command]
pub fn sync_reminders(reminders: Vec<Reminder>) -> usize {
  let count = imp::sync(&reminders);
  eprintln!("Desk Garden: {count} reminder(s) scheduled");
  count
}

#[tauri::command]
pub fn clear_delivered_reminders(ids: Vec<String>) {
  imp::clear_delivered(&ids);
}

/// Called by the page once it listens for reminder clicks; returns a click that arrived before.
#[tauri::command]
pub fn take_pending_open(state: tauri::State<'_, crate::AppState>) -> Option<String> {
  *state.page_ready.lock().unwrap() = true;
  state.pending_open.lock().unwrap().take()
}
