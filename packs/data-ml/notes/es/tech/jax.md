---
type: "tech"
kind: "library"
title: "JAX"
layer: "ml"
language: "python"
use_when: ["Investigación numérica Python diferenciable con transformaciones componibles","Cálculos de arrays con grad, jit y vmap"]
avoid_when: ["La entrega completa es un informe de dataframes convencional","Se exigen efectos mutables Python dentro de transformaciones compiladas"]
performs_best: ["Transformaciones de funciones numéricas sobre arrays"]
related: ["numpy","pytorch","mlflow"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["jax","python","machine-learning"]
packages: {"pypi":["jax"]}
---

JAX ofrece arrays, diferenciación y compilación. Mantén funciones puras, pasa claves aleatorias explícitas y entiende trazado y restricciones de formas. Valida disponibilidad de aceleradores y precisión.

Notas relacionadas: [[numpy]], [[pytorch]], [[mlflow]].

Referencia: https://docs.jax.dev/en/latest/
