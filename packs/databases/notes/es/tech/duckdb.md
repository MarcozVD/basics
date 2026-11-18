---
type: "tech"
kind: "database"
title: "DuckDB"
layer: "data"
use_when: ["SQL analítico embebido sobre archivos columnares locales","Consultas de informes CSV y Parquet dentro del proceso"]
avoid_when: ["Un servidor transaccional compartido debe coordinar muchos escritores","El centro es CRUD transaccional por registro con baja latencia","Búsqueda full-text indexada de documentos como carga principal"]
performs_best: ["Escaneos y agregaciones SQL analíticas locales"]
related: ["sqlite","postgresql"]
practices: []
checks: []
tags: ["analytics","columnar","embedded-sql"]
---

DuckDB ejecuta SQL analítico dentro del proceso y consulta CSV y Parquet. Planifica memoria y propiedad de archivos, parametriza SQL y prueba nulos e inferencia de tipos. No sustituye una base de servicio transaccional concurrente. Relacionadas: [[sqlite]], [[postgresql]].

Referencia: https://duckdb.org/docs/stable/
