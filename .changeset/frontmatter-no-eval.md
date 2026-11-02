---
"@marcozvd/basics-core": patch
"@marcozvd/basics": patch
---

Security: notes are no longer parsed with gray-matter's JavaScript or CoffeeScript engines. A note, pack file or proposal whose frontmatter opened with `---js` (or `---javascript`, `---coffee`) was evaluated with `eval` when Basics read it, so installing a malicious community pack or opening a shared vault could run code. Such files are now reported as invalid and never executed; YAML and JSON frontmatter work as before.
