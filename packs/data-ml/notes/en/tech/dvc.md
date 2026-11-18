---
type: "tech"
kind: "library"
title: "DVC"
layer: "ml"
language: "python"
use_when: ["Python data project with versioned dataset references and file-based pipelines","Reproducible data artifacts tied to code revisions"]
avoid_when: ["Only an in-memory dataframe library is required","A long-running distributed workflow scheduler is mandatory"]
performs_best: ["Versioned data references and declared file dependencies"]
related: ["mlflow","prefect","dagster"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["dvc","python","machine-learning"]
packages: {"pypi":["dvc"]}
---

DVC tracks data references and pipeline dependencies alongside source control. Configure artifact storage and access separately, declare inputs and outputs and test rebuilding from clean state. Do not commit private data or storage credentials.

Related notes: [[mlflow]], [[prefect]], [[dagster]].

Reference: https://dvc.org/doc
