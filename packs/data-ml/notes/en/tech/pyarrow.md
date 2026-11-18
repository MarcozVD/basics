---
type: "tech"
kind: "library"
title: "PyArrow"
layer: "data"
language: "python"
use_when: ["Arrow tables and Parquet dataset interchange","Columnar batch data schemas shared across tools"]
avoid_when: ["A high-level dataframe API alone is sufficient","Online transactional application writes are required","Online transactional API persistence with relational application tables and rollbacks","Live records shared by concurrent users needing synchronized writes"]
performs_best: ["Arrow columnar interchange and Parquet I/O"]
related: ["pandas","polars","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pyarrow","data-analysis"]
packages: {"pypi":["pyarrow"]}
---

PyArrow exposes Arrow arrays, tables and dataset I/O. Specify schemas, partition layout and timestamp semantics; test round trips across consumers. Columnar interchange does not guarantee every conversion is zero-copy.

Related notes: [[pandas]], [[polars]], [[duckdb]].

Reference: https://arrow.apache.org/docs/python/
