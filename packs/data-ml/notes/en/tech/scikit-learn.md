---
type: "tech"
kind: "library"
title: "scikit-learn"
layer: "ml"
language: "python"
use_when: ["Python machine learning classifier training on tabular data with a held-out split","Classical supervised models with preprocessing pipelines and cross-validation"]
avoid_when: ["Custom neural network training is central","A service HTTP framework is needed rather than model training"]
performs_best: ["Composable estimators, preprocessing and model evaluation"]
related: ["pandas","numpy","mlflow","hypothesis"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["scikit-learn","python","machine-learning"]
packages: {"pypi":["scikit-learn"]}
---

scikit-learn provides estimators, pipelines and model selection. Split before fitting preprocessing, tune only on training/validation data and reserve an untouched held-out set. Choose metrics for the task and document class imbalance and group/time dependencies.

Related notes: [[pandas]], [[numpy]], [[mlflow]], [[hypothesis]].

Reference: https://scikit-learn.org/stable/
