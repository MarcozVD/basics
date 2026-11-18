---
type: "tech"
kind: "library"
title: "Polars"
layer: "data"
language: "python"
use_when: ["dataframe transformations using lazy expressions","Columnar batch analysis over Parquet files","Dataframe analysis using SQLContext and SQL expressions"]
avoid_when: ["Existing code requires pandas index semantics unchanged","A transactional application database is needed","Online transactional API persistence with relational application tables and rollbacks","Live records shared by concurrent users needing synchronized writes"]
performs_best: ["Expression-based lazy dataframe query plans"]
related: ["pandas","pyarrow","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["polars","data-analysis"]
packages: {"pypi":["polars"]}
---

Polars offers eager and lazy dataframes with expressions. Inspect query plans and test null, ordering and casting semantics. Streaming support depends on operations; do not assume every query has bounded memory.

Related notes: [[pandas]], [[pyarrow]], [[duckdb]].

Reference: https://docs.pola.rs/
