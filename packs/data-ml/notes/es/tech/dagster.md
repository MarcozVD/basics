---
type: "tech"
kind: "library"
title: "Dagster"
layer: "ml"
language: "python"
use_when: ["Pipelines batch Python organizados en activos y dependencias","Trazabilidad de datasets materializados y procesamiento particionado"]
avoid_when: ["Un notebook aislado no necesita orquestación","El componente faltante es un motor transaccional"]
performs_best: ["Orquestación de datos orientada a activos"]
related: ["prefect","dvc","pyarrow"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["dagster","python","machine-learning"]
packages: {"pypi":["dagster"]}
---

Dagster modela activos y dependencias. Define particiones, recursos y checks de materialización; prueba reejecuciones y fallos parciales. Orquestar no sustituye transacciones ni aserciones de calidad.

Notas relacionadas: [[prefect]], [[dvc]], [[pyarrow]].

Referencia: https://docs.dagster.io/
