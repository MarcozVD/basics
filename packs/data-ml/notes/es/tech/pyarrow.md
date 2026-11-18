---
type: "tech"
kind: "library"
title: "PyArrow"
layer: "data"
language: "python"
use_when: ["Tablas Arrow e intercambio de datasets Parquet","Esquemas columnares batch compartidos entre herramientas"]
avoid_when: ["Basta una API de dataframe de alto nivel","Se exigen escrituras transaccionales online","Persistencia de API transaccional online con tablas relacionales y rollback","Registros compartidos por usuarios concurrentes que necesitan escrituras sincronizadas"]
performs_best: ["Intercambio columnar Arrow y entrada/salida Parquet"]
related: ["pandas","polars","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pyarrow","data-analysis"]
packages: {"pypi":["pyarrow"]}
---

PyArrow expone arrays, tablas y datasets Arrow. Define esquemas, particiones y semántica temporal; prueba ida y vuelta entre consumidores. El intercambio columnar no garantiza conversiones sin copia.

Notas relacionadas: [[pandas]], [[polars]], [[duckdb]].

Referencia: https://arrow.apache.org/docs/python/
