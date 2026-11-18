---
type: "tech"
kind: "library"
title: "MLflow"
layer: "ml"
language: "python"
use_when: ["Python ML experiment tracking with parameters, metrics and artifacts","Comparing model-training runs with recorded evaluation results"]
avoid_when: ["Only a dataframe transformation library is needed","No experiment metadata or artifacts will be retained"]
performs_best: ["Recorded model experiments and artifact lineage"]
related: ["scikit-learn","pytorch","dvc"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["mlflow","python","machine-learning"]
packages: {"pypi":["mlflow"]}
---

MLflow records experiment runs, parameters, metrics and artifacts. Define run boundaries, dataset references and artifact retention. Tracking a metric does not validate the split or prevent leakage; test those separately.

Related notes: [[scikit-learn]], [[pytorch]], [[dvc]].

Reference: https://mlflow.org/docs/latest/
