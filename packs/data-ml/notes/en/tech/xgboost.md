---
type: "tech"
kind: "library"
title: "XGBoost"
layer: "ml"
language: "python"
use_when: ["Python gradient-boosted tree training for structured tabular data","Classifier or regression baselines using boosted trees"]
avoid_when: ["A custom neural architecture is required","Only data ingestion orchestration is needed"]
performs_best: ["Gradient-boosted tree ensembles"]
related: ["scikit-learn","pandas","lightgbm"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["xgboost","python","machine-learning"]
packages: {"pypi":["xgboost"]}
---

XGBoost trains boosted-tree models. Compare against a simple baseline, use validation for early stopping and tuning, and evaluate once on held-out data. Verify categorical and missing-value behavior for the chosen API and configuration.

Related notes: [[scikit-learn]], [[pandas]], [[lightgbm]].

Reference: https://xgboost.readthedocs.io/en/stable/
