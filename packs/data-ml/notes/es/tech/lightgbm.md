---
type: "tech"
kind: "library"
title: "LightGBM"
layer: "ml"
language: "python"
use_when: ["Gradient boosting Python tabular con árboles por histogramas","Experimentos estructurados comparando ensamblados de árboles"]
avoid_when: ["El centro son capas neuronales diferenciables propias","Solo se necesita validar datasets"]
performs_best: ["Árboles potenciados por histogramas"]
related: ["xgboost","scikit-learn","pandas"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["lightgbm","python","machine-learning"]
packages: {"pypi":["lightgbm"]}
---

LightGBM ofrece árboles con gradient boosting. Ajusta complejidad contra validación, registra semillas y documenta categorías. Mide el dataset real sin suponer ventajas universales de velocidad o precisión.

Notas relacionadas: [[xgboost]], [[scikit-learn]], [[pandas]].

Referencia: https://lightgbm.readthedocs.io/en/stable/
