---
type: "tech"
kind: "database"
title: "DuckDB"
layer: "data"
use_when: ["Embedded analytical SQL over local columnar files","In-process CSV and Parquet reporting queries"]
avoid_when: ["A shared transactional server must coordinate many application writers","Low-latency per-record transactional CRUD is central","Indexed full-text search over application records is the primary workload"]
performs_best: ["Local analytical SQL scans and aggregations"]
related: ["sqlite","postgresql"]
practices: []
checks: []
tags: ["analytics","columnar","embedded-sql"]
---

DuckDB runs analytical SQL in process and can query files such as CSV and Parquet. Plan memory and file ownership, parameterize SQL and test nulls and type inference. It is not a replacement for a concurrent transactional service database. Related: [[sqlite]], [[postgresql]].

Reference: https://duckdb.org/docs/stable/
