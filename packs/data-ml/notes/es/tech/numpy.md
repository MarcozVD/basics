---
type: "tech"
kind: "library"
title: "NumPy"
layer: "data"
language: "python"
use_when: ["Arrays numéricos y cálculos vectorizados","Datos numéricos densos con formas y tipos explícitos"]
avoid_when: ["La abstracción principal son joins relacionales etiquetados","Se requiere un servidor de base persistente","Persistencia de API transaccional online con tablas relacionales y rollback","Registros compartidos por usuarios concurrentes que necesitan escrituras sincronizadas"]
performs_best: ["Operaciones numéricas orientadas a arrays"]
related: ["pandas","scikit-learn","pyarrow"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["numpy","data-analysis"]
packages: {"pypi":["numpy"]}
---

NumPy ofrece arrays multidimensionales y operaciones numéricas. Comprueba formas, broadcasting, promoción de tipos y tolerancia numérica. Vectorizar puede crear temporales grandes; mide memoria además de tiempo.

Notas relacionadas: [[pandas]], [[scikit-learn]], [[pyarrow]].

Referencia: https://numpy.org/doc/
