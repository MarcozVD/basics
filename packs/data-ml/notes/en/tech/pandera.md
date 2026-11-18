---
type: "tech"
kind: "library"
title: "Pandera"
layer: "testing"
language: "python"
use_when: ["Python dataframe schema validation at dataset boundaries","Assertions for tabular columns, types and value constraints"]
avoid_when: ["Only general-purpose unit assertions are needed","The chosen dataframe backend is unsupported"]
performs_best: ["Declarative dataframe schemas and data checks"]
related: ["pandas","polars","pytest"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pandera","python","python-validation"]
packages: {"pypi":["pandera"]}
---

Pandera validates dataframe schemas and checks. Choose the appropriate backend and validate nullability, ranges and cross-column assumptions. Runtime data validation complements static typing; decide how invalid records are rejected or quarantined.

Related notes: [[pandas]], [[polars]], [[pytest]].

Reference: https://pandera.readthedocs.io/en/stable/
