---
type: "tech"
kind: "library"
title: "pandas"
layer: "data"
language: "python"
use_when: ["dataframe analysis and cleaning CSV tables","Tabular data reports with labeled columns and indexes","Tabular analysis of SQL query results loaded into a dataframe"]
avoid_when: ["A concurrent transactional database server is required","The complete working set cannot fit the selected execution plan","Online transactional API persistence with relational application tables and rollbacks","Live records shared by concurrent users needing synchronized writes"]
performs_best: ["Labeled tabular transformations and exploratory analysis"]
related: ["numpy","pyarrow","polars","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pandas","data-analysis"]
packages: {"pypi":["pandas"]}
---

pandas provides dataframes and series for tabular analysis. Specify dtypes, missing-value rules and join cardinality. Measure memory on representative data; use chunked or alternative execution when a full in-memory frame is unsuitable.

Related notes: [[numpy]], [[pyarrow]], [[polars]], [[duckdb]].

Reference: https://pandas.pydata.org/docs/
