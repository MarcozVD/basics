---
type: "tech"
kind: "library"
title: "DVC"
layer: "ml"
language: "python"
use_when: ["Proyecto de datos Python con referencias versionadas y pipelines de archivos","Artefactos de datos reproducibles ligados a revisiones de código"]
avoid_when: ["Solo se necesita una biblioteca de dataframes en memoria","Es obligatorio un planificador distribuido permanente"]
performs_best: ["Referencias versionadas y dependencias de archivos declaradas"]
related: ["mlflow","prefect","dagster"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["dvc","python","machine-learning"]
packages: {"pypi":["dvc"]}
---

DVC sigue referencias de datos y dependencias junto al control de versiones. Configura almacenamiento y acceso aparte, declara entradas/salidas y prueba reconstrucción limpia. No publiques datos privados ni credenciales.

Notas relacionadas: [[mlflow]], [[prefect]], [[dagster]].

Referencia: https://dvc.org/doc
