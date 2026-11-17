---
type: "tech"
kind: "library"
title: "database/sql"
layer: "data"
language: "go"
use_when: ["Go SQL access through a standard driver interface","Go persistence with explicit SQL and database/sql transactions"]
avoid_when: ["A generated entity model is required","Database-specific native APIs are the main requirement","Selecting a database engine or full-text index rather than a client API"]
performs_best: ["Standard Go SQL connection-pool and transaction APIs"]
related: ["go","pgx","sqlc","postgresql","sqlite"]
practices: ["go-context","go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","database-sql"]
---

# database/sql

database/sql defines Go SQL access over a separately selected driver, not a database engine or indexing implementation. sql.DB manages a pool; configure it, close rows and check iteration errors. Use parameter binding and context-aware methods. Driver and SQL dialect differences still need real database tests.

Related notes: [[go]], [[pgx]], [[sqlc]], [[postgresql]], [[sqlite]].

[Official reference](https://go.dev/doc/database/).
