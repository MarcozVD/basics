---
type: "tech"
kind: "library"
title: "PyTorch"
layer: "ml"
language: "python"
use_when: ["Python neural network training with automatic differentiation","Custom tensor models and explicit training loops"]
avoid_when: ["A small classical tabular baseline is sufficient","Only experiment tracking is needed"]
performs_best: ["Tensor computation and custom neural training"]
related: ["numpy","mlflow","scikit-learn"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pytorch","python","machine-learning"]
packages: {"pypi":["torch"]}
---

PyTorch supplies tensors, automatic differentiation and neural-network modules. Separate training and evaluation modes, manage device and gradient lifetimes and record dependencies. Seeds alone do not promise identical results across devices or releases.

Related notes: [[numpy]], [[mlflow]], [[scikit-learn]].

Reference: https://docs.pytorch.org/docs/stable/index.html
