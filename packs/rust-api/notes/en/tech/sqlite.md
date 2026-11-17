---
type: "tech"
kind: "database"
title: "SQLite"
layer: "data"
use_when: ["Embedded SQL storage in one application","Local database files without a separate server"]
avoid_when: ["Many independent machines need direct database access","Sustained concurrent writers need a server database"]
performs_best: ["Embedded relational storage","Simple deployment with local persistence"]
related: ["postgresql","rusqlite","sqlx"]
practices: ["sql-migrations"]
checks: []
tags: ["sqlite","embedded","local-storage"]
---

# SQLite

SQLite runs inside the application rather than as a separate database server. Check writer concurrency and backup requirements. Use a client/server database such as [[postgresql]] when shared remote access is the primary requirement.

Related notes: [[postgresql]], [[rusqlite]], [[sqlx]].

Official reference: [SQLite](https://www.sqlite.org/whentouse.html).
