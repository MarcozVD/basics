---
type: "tech"
kind: "library"
title: "Pandera"
layer: "testing"
language: "python"
use_when: ["Validación Python de esquemas de dataframes en límites de datasets","Aserciones sobre columnas, tipos y restricciones tabulares"]
avoid_when: ["Solo se necesitan aserciones unitarias generales","El backend de dataframe elegido no está soportado"]
performs_best: ["Esquemas declarativos y checks de datos tabulares"]
related: ["pandas","polars","pytest"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pandera","python","python-validation"]
packages: {"pypi":["pandera"]}
---

Pandera valida esquemas y checks de dataframes. Elige backend y valida nulos, rangos y supuestos entre columnas. La validación runtime complementa tipado estático; define rechazo o cuarentena de registros inválidos.

Notas relacionadas: [[pandas]], [[polars]], [[pytest]].

Referencia: https://pandera.readthedocs.io/en/stable/
