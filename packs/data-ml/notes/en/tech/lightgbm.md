---
type: "tech"
kind: "library"
title: "LightGBM"
layer: "ml"
language: "python"
use_when: ["Python tabular gradient boosting with histogram-based trees","Structured-data experiments comparing tree ensembles"]
avoid_when: ["Custom differentiable neural layers are central","Only dataset validation is needed"]
performs_best: ["Histogram-based gradient-boosted trees"]
related: ["xgboost","scikit-learn","pandas"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["lightgbm","python","machine-learning"]
packages: {"pypi":["lightgbm"]}
---

LightGBM provides gradient-boosted trees. Tune tree complexity against validation data, track seeds and document categorical encodings. Benchmark the actual dataset rather than assuming a universal speed or accuracy advantage.

Related notes: [[xgboost]], [[scikit-learn]], [[pandas]].

Reference: https://lightgbm.readthedocs.io/en/stable/
