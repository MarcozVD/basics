---
type: "tech"
kind: "library"
title: "JAX"
layer: "ml"
language: "python"
use_when: ["Python differentiable numerical research with composable transformations","Array computations using grad, jit and vmap"]
avoid_when: ["A conventional dataframe report is the entire deliverable","Mutable Python side effects must run inside compiled transforms"]
performs_best: ["Function transformations over numerical array programs"]
related: ["numpy","pytorch","mlflow"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["jax","python","machine-learning"]
packages: {"pypi":["jax"]}
---

JAX offers array computation, automatic differentiation and compilation transforms. Keep transformed functions pure, pass random keys explicitly and understand tracing and static-shape constraints. Accelerator availability and precision settings require explicit validation.

Related notes: [[numpy]], [[pytorch]], [[mlflow]].

Reference: https://docs.jax.dev/en/latest/
