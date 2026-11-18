---
type: "tech"
kind: "library"
title: "XGBoost"
layer: "ml"
language: "python"
use_when: ["Entrenamiento Python de árboles con gradient boosting sobre tablas","Baselines de clasificación o regresión con árboles potenciados"]
avoid_when: ["Se exige una arquitectura neuronal propia","Solo se necesita orquestar ingestión"]
performs_best: ["Ensamblados de árboles con gradient boosting"]
related: ["scikit-learn","pandas","lightgbm"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["xgboost","python","machine-learning"]
packages: {"pypi":["xgboost"]}
---

XGBoost entrena modelos de árboles potenciados. Compara con un baseline simple, usa validación para parada temprana y ajustes y evalúa una vez en test reservado. Verifica categorías y ausencias según API y configuración.

Notas relacionadas: [[scikit-learn]], [[pandas]], [[lightgbm]].

Referencia: https://xgboost.readthedocs.io/en/stable/
