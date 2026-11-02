---
"@marcozvd/basics": patch
---

- Desktop app: the window controls (minimize, maximize, close) and the drag area now live in the app header, and browser shortcuts and menus (reload, print, zoom, find, context menu) are turned off. Ctrl+F opens the app search.
- Fix: after an update, the browser or the desktop app could keep showing the previous UI. `index.html` is now always revalidated, and hashed files under `/assets/` are cached for good.
