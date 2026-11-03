---
"@marcozvd/basics": patch
---

The desktop app can update itself.

- When the app starts it checks for a new version. If one is available, a card in the top-right corner shows the version, the release notes and **Update and restart**. **Later** hides it until the next start.
- **Update and restart** downloads the update with a progress bar, closes the app, installs it and opens the new version. Your vault and config are not touched.
- Settings → Updates shows the installed version, has **Check now**, and a switch for checking on start (on by default).
- The first version with the updater has to be installed by hand, once, from the GitHub Releases page.
