---
type: "tech"
kind: "library"
title: "Polars"
layer: "data"
language: "python"
use_when: ["Transformaciones de dataframes con expresiones lazy","Análisis batch columnar sobre archivos Parquet","Análisis de dataframes mediante SQLContext y expresiones SQL"]
avoid_when: ["El código exige semántica de índices pandas sin cambios","Se necesita una base transaccional de aplicación","Persistencia de API transaccional online con tablas relacionales y rollback","Registros compartidos por usuarios concurrentes que necesitan escrituras sincronizadas"]
performs_best: ["Planes lazy de dataframes basados en expresiones"]
related: ["pandas","pyarrow","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["polars","data-analysis"]
packages: {"pypi":["polars"]}
---

Polars ofrece dataframes eager y lazy con expresiones. Inspecciona planes y prueba nulos, orden y conversiones. El streaming depende de operaciones; no supongas memoria acotada en toda consulta.

Notas relacionadas: [[pandas]], [[pyarrow]], [[duckdb]].

Referencia: https://docs.pola.rs/
