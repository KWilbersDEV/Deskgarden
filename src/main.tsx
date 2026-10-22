import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Fonts are bundled so the app looks the same offline and in the desktop app.
import '@fontsource/fredoka/500.css';
import '@fontsource/fredoka/600.css';
import '@fontsource/nunito/400.css';
import '@fontsource/nunito/600.css';
import '@fontsource/nunito/700.css';
import App from './App';
import { initPlatform } from './platform';
import { NewerDataError, isDesktop, loadState, openStore } from './storage';
import './App.css';

const root = createRoot(document.getElementById('root')!);

async function start() {
  // The menu bar quick-add is a small second window of the desktop app. It never touches the
  // saved data itself: it asks the main window to add the task.
  if (isDesktop) {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    if (getCurrentWindow().label === 'quick-add') {
      const { QuickAdd } = await import('./QuickAdd');
      root.render(
        <StrictMode>
          <QuickAdd />
        </StrictMode>,
      );
      return;
    }
  }
  await openStore();
  await initPlatform();
  const initial = loadState();
  root.render(
    <StrictMode>
      <App initial={initial} />
    </StrictMode>,
  );
}

start().catch((err: unknown) => {
  // Without its saved data the app must not start, or the next save would replace that data.
  const message =
    err instanceof NewerDataError
      ? 'Your Desk Garden data was saved by a newer version of the app. Update Desk Garden to open it. Nothing has been changed.'
      : `Desk Garden couldn't open its saved data, so it hasn't changed anything. Quit and open the app again. (${String(err)})`;
  root.render(
    <p className="load-error" role="alert">
      {message}
    </p>,
  );
});
