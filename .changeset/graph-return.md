---
"@marcozvd/basics": patch
---

Graph loads faster and stays usable on big vaults.

- Large graphs (over 300 notes) settle in the background, so you can click and open notes while the layout runs. On an 860-note vault the flat graph is usable about 16 seconds sooner.
- Zoomed out on a graph over 300 notes, labels show only the best-connected notes. Zoom in to see the rest.
- Going back to Graph shows the picture you left, with the same positions and zoom, without laying it out again. On an 860-note vault the first frame came after about 5 to 16 seconds before, and now it is about 0.5 seconds.
- Reloading the page keeps the node positions for the same vault and view.
- Graph data is reused for five minutes, so opening the page again does not refetch it.
