# Desk Garden

Desk Garden is a small, playful to-do app that grows a plant as you get things done. Every task you complete gives your plant a growth point, and it changes through five stages from seed to full bloom. Fully grown plants move to your garden shelf, and you start a new seed.

Along the way you can:

- plan today's tasks, including repeating ones (daily, weekly or on chosen weekdays)
- pin up to three tasks as today's top three
- focus on a task with a built-in focus and break timer
- unlock new plant species, pots and backgrounds as your garden grows
- get reminders for tasks, even when the app is closed
- add tasks quickly from the macOS menu bar

Everything is stored on your own Mac. There is no account and no cloud sync.

## Installing on macOS

Requires macOS 13 (Ventura) or later, on Apple silicon or Intel.

1. Download `Desk Garden_1.1.0_universal.dmg` from the [Releases](https://github.com/KWilbersDEV/Deskgarden/releases) page.
2. Double-click the `.dmg` to open it.
3. Drag **Desk Garden** into the **Applications** folder.
4. Eject the disk image, then open Desk Garden from Applications or Launchpad.

### "Apple could not verify Desk Garden"

The app isn't notarized by Apple yet, so macOS blocks it the first time you open it:

1. Click **Done** in the warning.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the message about Desk Garden and click **Open Anyway**, then confirm with your password.

You only need to do this once.

### Reminders

The first time you turn on a reminder for a task, macOS asks whether Desk Garden may send notifications. Choose **Allow**. You can change this later in **System Settings → Notifications → Desk Garden**.

### Updating

Download the new `.dmg` and drag Desk Garden into Applications again, choosing **Replace**. Your tasks and garden are kept.

### Your data

Your garden is saved in `~/Library/Application Support/com.kianwilbers.deskgarden/`. To move it to another Mac, use **Export** and **Import** in the app's Settings.

### Uninstalling

Drag Desk Garden from Applications to the Trash. To also delete your garden, remove the folder above.
