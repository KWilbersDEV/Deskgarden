# Desk Garden

Finish today's tasks and grow a little desk plant. Repeat tasks, pin today's top three, focus with a timer, set reminders, and collect every plant that reaches full bloom in your garden. React + TypeScript + Vite, with tasks saved in the browser's `localStorage`. The same production build also ships as a macOS desktop app (Tauri), see [Desktop app (macOS)](#desktop-app-macos), and the web app can run in Docker, see [Docker (web app)](#docker-web-app).

## Setup

```sh
npm install
```

## Commands

| Command                | What it does                                                         | Output / address              |
| ---------------------- | -------------------------------------------------------------------- | ----------------------------- |
| `npm run dev`          | Development server with live reload while you edit                   | http://localhost:5173         |
| `npm run build:dev`    | Type-checks, then builds the **development** version                 | `build/development/`          |
| `npm run preview:dev`  | Serves the development build so you can test it                      | http://localhost:4174         |
| `npm run build:prod`   | Type-checks, then builds the **production** version, ready to deploy | `build/production/`           |
| `npm run preview:prod` | Serves the production build locally (does not deploy)                | http://localhost:4173         |
| `npm run build`        | Alias for `npm run build:prod`, for hosts that run `build` by default | `build/production/`           |
| `npm run check`        | Type-check only                                                      | –                             |
| `npm test`             | Unit tests for dates, recurrence, rewards, collection, timer and reminders (Node's built-in test runner) | – |
| `npm run test:timezones` | The same tests in several time zones, including daylight-saving edge cases | – |

Each build empties and writes only its own folder, so building one version never overwrites the other. Run the matching `build:*` command before its `preview:*` command; preview serves whatever is in that folder. Ports are fixed (`strictPort`), so a command fails instead of quietly moving to another port if its port is taken.

**Deploy `build/production/`.** It is a static site: upload the contents of that folder to any static host. Nothing in this repo deploys automatically.

## Environments

The environment is set explicitly, never guessed:

| File               | Used by                                   | `VITE_APP_ENV` |
| ------------------ | ----------------------------------------- | -------------- |
| `.env.development` | `dev`, `build:dev`, `preview:dev`         | `development`  |
| `.env.production`  | `build:prod`, `build`, `preview:prod`     | `production`   |

The app reads `import.meta.env.VITE_APP_ENV`. It does not use Vite's `import.meta.env.DEV`/`PROD` flags to decide the environment, because a development *build* is still a production-style bundle as far as those flags are concerned. `vite.config.ts` stops the build if a mode has no matching `VITE_APP_ENV` (for example `--mode staging` with no `.env.staging`).

|                     | Development (server and build)                        | Production                     |
| ------------------- | ----------------------------------------------------- | ------------------------------ |
| Saved under         | `desk-garden:development:v1`                          | `desk-garden:v1`               |
| Page title          | Desk Garden (Dev)                                     | Desk Garden                    |
| Banner              | Striped "Development" bar: live server or build, storage key, **Add sample tasks** | none                           |
| Bundle              | Unminified, with source maps                          | Minified, no source maps       |

The development banner, its styles and the sample tasks live in `src/dev/` and are loaded only when `VITE_APP_ENV` is `development`. Production builds leave them out entirely, and the production bundle contains only the production storage key.

**No secrets in `.env` files.** Every `VITE_` variable is compiled into the JavaScript that ships to browsers, so anyone can read it. These files only hold public settings. Machine-specific overrides can go in `.env.development.local` / `.env.production.local`, which are git-ignored, but they are just as public once built.

## Saved data

- **Existing data is production data.** Tasks saved before environments were added used the key `desk-garden:v1`, which production still uses. Production loads them as before (older formats are upgraded in place); nothing is moved, erased or replaced.
- **Development never changes production data.** It reads and writes only `desk-garden:development:v1`. If production data exists at the same address, the development banner says so and shows how many tasks it holds; it only counts them.
- **Browsers store data per address** (protocol, host and port). `localhost:5173`, `localhost:4174` and `localhost:4173` each have their own storage, and a deployed site has its own too. The separate keys keep the two versions apart even when they share an address.
- **To open existing local data as production:** if you saved tasks with `npm run dev` before environments existed, they live at `http://localhost:5173` under the production key. Stop the dev server, then run:

  ```sh
  npm run build:prod
  npm run preview:prod -- --port 5173
  ```

  Open http://localhost:5173. When you're done, stop the preview and start `npm run dev` again.

## Using Desk Garden

The **Today** view stays focused on today's tasks and your plant. **Garden**, **Customize** and **Settings** are in the navigation under the title (in a browser they're also at `#/garden`, `#/customize` and `#/settings`, so Back works).

### Growth points (the rules everything follows)

- Completing a task gives your plant **1 growth point** and counts one completion on that day (the daily count and **This week** chart). Unchecking it, or deleting it while done, takes exactly that point and count back; **Undo** returns it once. Subtasks, focus sessions and reminders never award points.
- **Lifetime growth** counts every point earned (net of unchecks) and is kept separately from the plant you're growing now. Lifetime growth = points of the plants in your garden + points of the current plant.

### Repeating tasks

In a task's details, choose **Repeat**: *Every day*, *Every week* (on one day), or *On selected days* (any weekdays). Each due day gets its **own copy**, so finishing today's never finishes another day's.

- **Missed days don't pile up.** A repeating task has at most one open copy. If you don't finish it, it stays on the list marked **Missed**, until the next day it's due, when the new copy replaces it. Days the app wasn't opened aren't back-filled.
- Copies are created once per day, so restarting the app, or deleting today's copy, never brings a duplicate back.
- Editing the title, notes, priority or subtasks of a copy updates the copies to come. **Does not repeat** stops it; existing copies become ordinary tasks.
- The details panel shows the recent history: done or missed, per day. Days use your Mac's or browser's local calendar.

### Today's top three

Click the **star** on a task (or **Pin to top three** in its details) to make it one of today's priorities. Up to three can be pinned; pinning a fourth asks which one to replace. Reorder them with the arrows, tick them off right in the card (that frees the slot), or start a **Focus** session from there. The top three starts empty each day.

### Focus timer

Choose **Focus** in the top three, or **Start focus session** in a task's details. Pick the durations (25 minutes of focus and a 5-minute break by default; your choice is remembered, and you can change the defaults in **Settings**), then **Start focus**. The plant card shows the task, the time left and a gentle breathing animation (off with *Reduce motion*). **Pause**, **Resume** or **Cancel** at any time.

The timer works from timestamps, so it stays right while the window is hidden, the Mac sleeps, or the app is closed and reopened. When a session ends it offers **Mark task done**, a break, or **Finish**. It never completes the task or awards a point by itself.

### Garden and customization

When your plant reaches **In bloom** (14 points), **Move to garden** puts it on your garden shelf with its name, species and the dates it was planted, bloomed and collected. Choose a name and species for the new seed. The plant always takes exactly 14 points with it; anything beyond carries over to the new seed. A plant can only be moved once.

In **Customize**, name your plant and choose its species, pot and background. Two of each are available from the start. The rest unlock at clear milestones (shown on each locked option with your progress), and unlocks are never taken away:

| Unlock | Milestone |
| --- | --- |
| Sky glaze pot | 10 lifetime points |
| Tulip | 15 lifetime points |
| Twilight background | 20 lifetime points |
| Speckled stoneware pot | 25 lifetime points |
| Cactus | 40 lifetime points |
| Starry night background | 60 lifetime points |
| Sunflower, Meadow background | 1 plant in your garden |
| Midnight & gold pot | 2 plants in your garden |

If you uncheck a task whose point went into a plant that's already in your garden, the garden plant keeps its bloom and your current plant owes the point (shown under its growth bar), so a point is never counted twice.

### Reminders

In a task's details, tick **Remind me** and choose a date and time (for a repeating task: a time on each day it's due). The first time, Desk Garden asks for permission to send notifications. Clicking a reminder opens the task. Completing, rescheduling or deleting a task updates its reminder, so you never get a stale or duplicate one.

| | Window open | Window closed | App quit |
| --- | --- | --- | --- |
| **Mac app** | ✓ | ✓ | ✓ macOS delivers it on time; clicking it opens Desk Garden on the task |
| **Browser** (including Docker) | ✓ while a Desk Garden tab is open | – | – |

- The Mac app hands reminders to macOS (UserNotifications), so they don't depend on the app running. Reminders for repeating tasks are scheduled two weeks ahead and topped up whenever Desk Garden runs, so after more than two weeks without opening it, repeating reminders pause until you do.
- In a browser, reminders use web notifications while the page is open. If notifications are blocked, an in-app reminder appears instead.
- Reminders need the installed app; `npm run desktop:dev` (an unbundled binary) shows them as unavailable.
- To turn notifications off or on later: System Settings › Notifications › Desk Garden (Mac app), or the site settings in your browser. **Settings** shows the current status.

### Menu bar (Mac app)

Desk Garden adds a sprout to the menu bar with the number of today's unfinished tasks. Its menu has **Quick Add Task…** (a small window: type and press Enter; Esc closes it), **Open Desk Garden** and **Quit Desk Garden**. Quick-add hands the task to the main window, which checks and saves it exactly like a task typed there. Closing the main window keeps Desk Garden running in the menu bar, so reminders and the count stay current; quit from the menu or with ⌘Q. Clicking the Dock icon brings the window back.

In a browser these desktop-only features are simply not shown (Settings explains what the Mac app adds); the web app never calls a desktop API.

## Data format and migrations

The saved garden carries a `version`. Older data is upgraded when it's loaded, without losing tasks, notes, subtasks, priorities, due dates, completion history or growth:

- **v1** (Desk Garden 1.0.0 and the web app before 1.1.0): `{ tasks, points, log }`. On load, the points become your first plant's points and your lifetime total; everything else is kept as is.
- **v2** (1.1.0): adds repeating tasks, the garden shelf, lifetime points, customization and unlocks, today's top three, the focus timer and timer settings.

Data saved by a **newer** version than the app you're running is never loaded or overwritten: the app shows a message and saves nothing. Development and production still use separate storage keys (and separate files in the Mac app), see [Environments](#environments).

## Your data: export and import

In **Settings**, **Your data** has two buttons:

- **Export data…** saves a backup file, `desk-garden-backup-<date>.json`, with everything: tasks and their details, repeating tasks, plant growth and lifetime points, your garden shelf, customization and unlocks, weekly history, today's top three, a running timer and settings. In a browser it downloads; in the desktop app a Save dialog asks where to put it.
- **Import data…** reads such a file. If the garden you're importing into is empty, the data is loaded straight away. Otherwise you choose:
  - **Combine** (the default) adds tasks, repeating tasks and garden plants you don't have yet (matched by id, never two copies of a repeating task for the same day), keeps the larger growing plant and the higher daily counts, and combines unlocks. Nothing is removed, and importing the same file twice changes nothing.
  - **Replace this garden** swaps everything for the file's contents. Export first if you might want the current garden back.
  - **Cancel** changes nothing.

Imports are validated and migrated exactly like saved data. Backups from 1.0.0 (format 1) import fine; bad or unrelated files, and backups from a newer app version, are rejected without changing anything. A raw saved value copied out of the browser's `localStorage` is accepted too.

**Moving your browser tasks to the desktop app:** open the browser version that has your tasks (for tasks saved with `npm run dev` before environments existed, see [To open existing local data as production](#saved-data)), choose **Export data…**, then open the desktop app, choose **Import data…** and pick the file. The same works between Macs or browsers.

## Docker (web app)

Docker runs the **web app** only, in two independent Compose projects. The macOS desktop app is always built on the Mac itself (`npm run desktop:build`, see below), not in Docker.

|                   | Development                                      | Production                                               |
| ----------------- | ------------------------------------------------ | -------------------------------------------------------- |
| Compose file      | `compose.dev.yaml` (project `desk-garden-dev`)   | `compose.prod.yaml` (project `desk-garden-prod`)         |
| Address           | http://localhost:5174                            | http://localhost:8080                                    |
| What runs         | Vite dev server (`npm run dev`), live reload     | nginx serving only the files from `build/production`    |
| Source            | Your project folder, mounted read-only: edits on the Mac appear immediately | Baked into the image: changes need a rebuild |
| Saves tasks under | `desk-garden:development:v1`                     | `desk-garden:v1`                                         |

Both are bound to `127.0.0.1`, so they're only reachable from this Mac.

### Setup

Install and start [Docker Desktop](https://www.docker.com/products/docker-desktop/). Nothing else is needed: the images install dependencies with `npm ci` from `package-lock.json`, so containers get exactly the locked versions (Linux builds of the native packages).

### Start and stop

| Command                    | Same as                                                                    |
| -------------------------- | -------------------------------------------------------------------------- |
| `npm run docker:dev`       | `docker compose -f compose.dev.yaml up --build --renew-anon-volumes -d`    |
| `npm run docker:dev:logs`  | `docker compose -f compose.dev.yaml logs -f`                               |
| `npm run docker:dev:down`  | `docker compose -f compose.dev.yaml down --volumes`                        |
| `npm run docker:prod`      | `docker compose -f compose.prod.yaml up --build -d`                        |
| `npm run docker:prod:logs` | `docker compose -f compose.prod.yaml logs -f`                              |
| `npm run docker:prod:down` | `docker compose -f compose.prod.yaml down`                                 |

The two projects are separate: starting or stopping one never affects the other, and both can run at once. Check what's running with `docker compose -f compose.dev.yaml ps` or `docker compose -f compose.prod.yaml ps` (production reports `healthy` once nginx answers).

**Development:** edit files under `src/` (or `index.html`, `vite.config.ts`, `.env.development`) on the Mac and the page at http://localhost:5174 updates by itself. The container keeps its own Linux `node_modules` in a volume; `docker:dev` refreshes it from the image on every start and `docker:dev:down` deletes it (`--volumes` removes only that volume). After changing dependencies, run `npm install` on the Mac (to update `package-lock.json`), then `npm run docker:dev` again.

**Production:** the `Dockerfile` builds in stages. It installs dependencies with `npm ci`, builds with `npm run build:prod` using only `package*.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `.env.production`, `public/` and `src/`, and then copies **only** `build/production` into a small unprivileged nginx image (`nginxinc/nginx-unprivileged:1.29-alpine`, read-only filesystem). The development banner, sample tasks, `.env.development`, source maps, source code and `node_modules` are not in the final image. To publish a change, rebuild:

```sh
npm run docker:prod        # rebuilds the image and replaces the running container
```

nginx (`docker/nginx.conf`) serves hashed files under `/assets/` with long-lived caching and returns a real 404 for missing ones. Every other path falls back to `index.html`. The app has no client-side routes, so the fallback only means a bookmarked or mistyped URL still opens the app. It also sends a Content Security Policy and other security headers (`docker/security-headers.conf`).

`.dockerignore` is an allow-list: only the files listed above reach Docker. Everything else stays on the Mac, including `node_modules`, build output, `release/`, `src-tauri/`, `.env.development` and local `.env.*.local` files.

### Your tasks and Docker

Task data is not stored in Docker. The app keeps it in your **browser's** `localStorage`, which belongs to the page's origin (protocol, host and port). There is no database or volume to back up, and removing or rebuilding a container never deletes tasks.

- http://localhost:5174 (Docker dev), http://localhost:8080 (Docker prod), http://localhost:5173 (`npm run dev`) and the preview ports each have their own, separate storage. Tasks saved in one don't appear in another.
- Within any one address, development and production still use different keys, as described in [Environments](#environments).
- To move tasks between addresses (for example, from `npm run dev` on 5173 into the Docker production site), use **Export data…** on one and **Import data…** on the other.
- Clearing site data for `localhost` in your browser deletes tasks for every localhost address.

### Change the ports

The ports can be changed per run with an environment variable:

```sh
DESK_GARDEN_DEV_PORT=5180 npm run docker:dev
DESK_GARDEN_PROD_PORT=8081 npm run docker:prod
```

Remember that a different port is a different origin, with its own saved tasks.

### Troubleshooting

| Problem | Fix |
| ------- | --- |
| `Cannot connect to the Docker daemon` | Start Docker Desktop and wait until it says it's running. |
| `Bind for 127.0.0.1:5174 failed: port is already allocated` (or `:8080`) | Something else uses the port. Find it with `lsof -nP -iTCP:5174 -sTCP:LISTEN`, stop it, or pick another port (above). |
| Dev page doesn't update after an edit | Check that you're on http://localhost:5174 and that the server is running (`npm run docker:dev:logs` should show `hmr update` lines). Edits outside the project folder, or under `build/`, `release/` or `src-tauri/`, are not watched. Restart with `npm run docker:dev:down && npm run docker:dev`. |
| Errors about missing packages or native bindings in dev (for example `@rolldown/binding-linux-…`) | The dependency volume is out of date. Run `npm run docker:dev:down && npm run docker:dev`. Never copy the Mac's `node_modules` into a container. |
| Production shows an old version | Rebuild: `npm run docker:prod`. To rule out the build cache: `docker compose -f compose.prod.yaml build --no-cache && npm run docker:prod`. |
| `npm ci` fails while building | `package-lock.json` doesn't match `package.json`. Run `npm install` on the Mac, then rebuild. |
| "My tasks are gone" | They're in a different origin's storage. Open the address where you saved them, or move them with Export and Import (see above). |
| Remove everything Docker made for Desk Garden | `npm run docker:dev:down && npm run docker:prod:down && docker image rm desk-garden:dev desk-garden:prod` |

## Desktop app (macOS)

The desktop app is a [Tauri 2](https://tauri.app) shell around **the production build** (`build/production/`, built by `npm run build:prod`). It contains no development banner, sample tasks or development settings. The web commands above are unchanged.

|                     |                                                        |
| ------------------- | ------------------------------------------------------ |
| Name                | Desk Garden                                            |
| Version             | `version` in `package.json` (also update `src-tauri/Cargo.toml`) |
| Bundle identifier   | `com.kianwilbers.deskgarden` (keep it stable: it decides where the app's data lives) |
| Architectures       | Universal: Apple silicon (arm64) and Intel (x86_64)     |
| Minimum macOS       | 13 Ventura                                             |
| Icon                | `packaging/app-icon.svg` (regenerate with `npm run desktop:icons`) |

### One-time setup

Tauri needs Rust and Apple's command line tools:

```sh
xcode-select --install                     # if not installed yet
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal
. "$HOME/.cargo/env"                       # or open a new terminal
rustup target add aarch64-apple-darwin x86_64-apple-darwin
npm install
```

The desktop npm scripts add `~/.cargo/bin` to their own `PATH`, so they find Rust even if your shell profile doesn't load it. To run `cargo` or `rustup` yourself, first run `. "$HOME/.cargo/env"` (or add that line to `~/.zshrc`).

### Commands

| Command                   | What it does                                                                     | Output |
| ------------------------- | -------------------------------------------------------------------------------- | ------ |
| `npm run desktop:dev`     | Opens the app in a window with live reload, using the **development** frontend (`npm run dev` on port 5173; stop any other dev server first) | – |
| `npm run desktop:build`   | Builds the production frontend, then a universal `.app` and `.dmg`              | `src-tauri/target/universal-apple-darwin/release/bundle/macos/Desk Garden.app`<br>`src-tauri/target/universal-apple-darwin/release/bundle/dmg/Desk Garden_<version>_universal.dmg` |
| `npm run desktop:pkg`     | Wraps the built `.app` in an Installer wizard with `pkgbuild` + `productbuild`, and copies the DMG next to it | `release/Desk Garden-<version>.pkg`<br>`release/Desk Garden_<version>_universal.dmg` |
| `npm run desktop:release` | `desktop:build`, then `desktop:pkg`                                              | `release/` |
| `npm run desktop:icons`   | Regenerates `src-tauri/icons/` from `packaging/app-icon.svg`                   | `src-tauri/icons/` |

`desktop:build` sets `CI=true` so Tauri skips the AppleScript that arranges the DMG's Finder window. That script needs permission to control Finder and times out in a terminal or session without it. The DMG still contains the app and an **Applications** shortcut; Finder simply shows them in its default layout.

For a release, run:

```sh
npm run desktop:release
```

`desktop:pkg` (`packaging/macos/build-pkg.sh`) refuses to package an app that isn't universal, doesn't contain the current `build/production` frontend, contains the development frontend, or has a broken signature. The Installer wizard (`packaging/macos/distribution.xml`, `welcome.html`, `conclusion.html`) always installs to `/Applications`, upgrades an existing copy in place and never runs scripts.

### Installing

- **DMG:** `open "release/Desk Garden_1.1.0_universal.dmg"`, drag **Desk Garden** onto **Applications**, then eject the disk image.
- **Installer package:** double-click `release/Desk Garden-1.1.0.pkg` and follow the wizard, or from Terminal:

  ```sh
  sudo installer -pkg "release/Desk Garden-1.1.0.pkg" -target /
  ```

Until the app is signed with a Developer ID and notarized (below), macOS Gatekeeper blocks it on first open when it was downloaded from the internet: Control-click the app (or the `.pkg`), choose **Open**, then **Open** again. Builds made on your own Mac open normally.

### Where the desktop app keeps your data

- `~/Library/Application Support/com.kianwilbers.deskgarden/garden.json` holds the garden (all features, see [Data format and migrations](#data-format-and-migrations)). It is written atomically (temporary file, then rename) on every change, so it survives quitting, crashes and restarts.
- Installing an update (DMG or `.pkg`) replaces only `/Applications/Desk Garden.app`; this folder is never touched, and nothing is imported or reset on update.
- The first time each app version starts with existing data, it saves a copy as `backups/garden-<version>.json` in the same folder, before migrating anything. For example, the first start of 1.1.0 keeps your 1.0.0 data as `backups/garden-1.1.0.json`. Existing backups are never overwritten.
- If the data file can't be read, it is renamed to `garden.unreadable-<timestamp>.json` instead of being replaced, and the app starts empty.
- `npm run desktop:dev` uses `garden-development.json` in the same folder, so desktop development never touches desktop production data either.
- Deleting the app does not delete your data. To start over, quit the app and remove the folder above (export first if you want a copy).

### Signing and notarization (release step, needs your Apple Developer account)

The local builds are ad-hoc signed (`"signingIdentity": "-"` in `src-tauri/tauri.conf.json`). That's enough to run them on this Mac, but for distribution they need a **Developer ID** signature and Apple **notarization**. These steps need your own certificates and credentials, so they are not automated. **Never commit certificates, passwords or API keys**; keep them in your keychain or in environment variables in your shell.

1. In your Apple Developer account, create a **Developer ID Application** and a **Developer ID Installer** certificate, and install both in your login keychain. Check they're there:

   ```sh
   security find-identity -v -p basic | grep "Developer ID"
   ```

2. Store notarization credentials once in your keychain (use an [app-specific password](https://support.apple.com/102654)):

   ```sh
   xcrun notarytool store-credentials desk-garden-notary --apple-id "<your Apple ID>" --team-id "<TEAMID>"
   ```

3. Build, sign and notarize the app and DMG. Tauri reads these variables and signs with the hardened runtime:

   ```sh
   export APPLE_SIGNING_IDENTITY="Developer ID Application: <Your Name> (<TEAMID>)"
   export APPLE_ID="<your Apple ID>" APPLE_PASSWORD="<app-specific password>" APPLE_TEAM_ID="<TEAMID>"
   npm run desktop:build
   ```

   (Alternatively use an App Store Connect API key: `APPLE_API_KEY`, `APPLE_API_ISSUER` and `APPLE_API_KEY_PATH`.)

4. Build the signed installer package, then notarize and staple it:

   ```sh
   PKG_SIGNING_IDENTITY="Developer ID Installer: <Your Name> (<TEAMID>)" npm run desktop:pkg
   xcrun notarytool submit "release/Desk Garden-1.1.0.pkg" --keychain-profile desk-garden-notary --wait
   xcrun stapler staple "release/Desk Garden-1.1.0.pkg"
   ```

5. Check the results:

   ```sh
   spctl --assess --type execute -vv "src-tauri/target/universal-apple-darwin/release/bundle/macos/Desk Garden.app"
   spctl --assess --type install -vv "release/Desk Garden-1.1.0.pkg"
   ```

### Releasing a new version

1. Change `version` in `package.json` and `src-tauri/Cargo.toml`.
2. `npm run desktop:release` (plus the signing steps above for a public release).
3. Users install the new DMG or `.pkg` over the old app; their data stays in Application Support.

## Project layout

```
src/
  model/                  the data model as pure functions, with unit tests (*.test.ts)
    garden.ts             every change (one reducer), reward rules, versioned migrations, import combine
    recurrence.ts         repeating tasks and the overdue policy
    plants.ts             stages, species, pots, backgrounds and unlocks
    timer.ts, reminders.ts, dates.ts
  App.tsx, App.css        Today view and navigation
  useGarden.ts            applies actions, saves, starts each new day
  TaskItem.tsx, TaskPanel.tsx, TopThree.tsx, FocusCard.tsx, CollectDialog.tsx
  views/                  Garden, Customize and Settings views
  Plant.tsx, StageTrack.tsx, WeekCard.tsx, OptionPicker.tsx
  storage.ts              where data is saved, storage key per environment
  platform.ts             reminders and menu bar behind one interface (browser or desktop)
  backup.ts, DataTools.tsx  export and import
  desktop.ts, QuickAdd.tsx  desktop-only bridge and menu bar quick-add (loaded only inside the app)
  dev/                    development-only banner and sample tasks
src-tauri/                Tauri desktop shell (Rust): config, icons, data files, menu bar,
  src/reminders.rs        macOS reminders (UserNotifications)
Dockerfile                web app images: dev server and production build + nginx
compose.dev.yaml          Docker development (port 5174)
compose.prod.yaml         Docker production (port 8080)
.dockerignore             allow-list of files sent to Docker
docker/                   nginx config and security headers for the production image
packaging/
  app-icon.svg            app icon source
  tray-icon.svg           menu bar icon source
  macos/                  .pkg Installer wizard: build-pkg.sh, distribution.xml, welcome/conclusion pages
```
