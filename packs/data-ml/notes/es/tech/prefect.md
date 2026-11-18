---
type: "tech"
kind: "library"
title: "Prefect"
layer: "ml"
language: "python"
use_when: ["Pipeline batch Python programado con reintentos y ejecuciones observables","Flujos de procesamiento coordinando funciones Python"]
avoid_when: ["Una transformación local no necesita orquestación","Solo se deben atender solicitudes HTTP online"]
performs_best: ["Ejecución de flujos Python con políticas explícitas de reintento"]
related: ["dagster","dvc","polars"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["prefect","python","machine-learning"]
packages: {"pypi":["prefect"]}
---

Prefect orquesta flows y tareas. Define escrituras idempotentes, límites, timeouts y observabilidad. Configura planificación y workers; reintentar no vuelve efectos externos exactamente una vez.

Notas relacionadas: [[dagster]], [[dvc]], [[polars]].

Referencia: https://docs.prefect.io/
