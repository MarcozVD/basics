---
type: "tech"
kind: "library"
title: "MLflow"
layer: "ml"
language: "python"
use_when: ["Seguimiento de experimentos ML Python con parámetros, métricas y artefactos","Comparación de entrenamientos con evaluaciones registradas"]
avoid_when: ["Solo se necesita una biblioteca de transformación tabular","No se conservarán metadatos ni artefactos de experimentos"]
performs_best: ["Experimentos registrados y trazabilidad de artefactos"]
related: ["scikit-learn","pytorch","dvc"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["mlflow","python","machine-learning"]
packages: {"pypi":["mlflow"]}
---

MLflow registra ejecuciones, parámetros, métricas y artefactos. Define límites de ejecución, referencias de datos y retención. Registrar métricas no valida la partición ni evita fugas; prueba eso aparte.

Notas relacionadas: [[scikit-learn]], [[pytorch]], [[dvc]].

Referencia: https://mlflow.org/docs/latest/
