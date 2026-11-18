---
type: "tech"
kind: "library"
title: "Prefect"
layer: "ml"
language: "python"
use_when: ["Python scheduled batch pipeline with task retries and observable runs","Data processing workflows coordinating Python functions"]
avoid_when: ["A single local transform needs no orchestration","Only online HTTP request handling is required"]
performs_best: ["Python workflow execution with explicit retry policies"]
related: ["dagster","dvc","polars"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["prefect","python","machine-learning"]
packages: {"pypi":["prefect"]}
---

Prefect orchestrates flows and tasks. Define idempotent writes, retry limits, timeouts and observability. Scheduling and worker infrastructure require configuration; retries do not make external side effects exactly-once.

Related notes: [[dagster]], [[dvc]], [[polars]].

Reference: https://docs.prefect.io/
