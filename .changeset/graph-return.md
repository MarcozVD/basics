---
"@marcozvd/basics": patch
---

Graph loads faster when you come back to it.

- Going back to Graph shows the picture you left, with the same positions and zoom, without laying it out again. On an 860-note vault the first frame came after about 5 to 16 seconds before, and now it is about 0.5 seconds.
- Reloading the page keeps the node positions for the same vault and view.
- Graph data is reused for five minutes, so opening the page again does not refetch it.
