---
type: "tech"
kind: "library"
title: "Dagster"
layer: "ml"
language: "python"
use_when: ["Python batch data pipelines organized around assets and dependencies","Materialized dataset lineage and partitioned processing"]
avoid_when: ["A standalone notebook needs no orchestration","A transactional database engine is the missing component"]
performs_best: ["Asset-oriented data orchestration"]
related: ["prefect","dvc","pyarrow"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["dagster","python","machine-learning"]
packages: {"pypi":["dagster"]}
---

Dagster models data assets and their dependencies. Define partitions, resource configuration and materialization checks; test reruns and partial failures. Orchestration does not replace storage transactions or data-quality assertions.

Related notes: [[prefect]], [[dvc]], [[pyarrow]].

Reference: https://docs.dagster.io/
