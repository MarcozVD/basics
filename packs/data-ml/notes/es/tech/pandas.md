---
type: "tech"
kind: "library"
title: "pandas"
layer: "data"
language: "python"
use_when: ["Análisis con dataframes y limpieza de tablas CSV","Informes tabulares con columnas e índices etiquetados","Análisis tabular de resultados SQL cargados a un dataframe"]
avoid_when: ["Se requiere un servidor transaccional concurrente","El conjunto de trabajo no cabe en el plan elegido","Persistencia de API transaccional online con tablas relacionales y rollback","Registros compartidos por usuarios concurrentes que necesitan escrituras sincronizadas"]
performs_best: ["Transformaciones tabulares etiquetadas y análisis exploratorio"]
related: ["numpy","pyarrow","polars","duckdb"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pandas","data-analysis"]
packages: {"pypi":["pandas"]}
---

pandas ofrece dataframes y series para análisis tabular. Define tipos, reglas de valores ausentes y cardinalidad de joins. Mide memoria con datos representativos; usa bloques u otra ejecución si no conviene un frame completo en memoria.

Notas relacionadas: [[numpy]], [[pyarrow]], [[polars]], [[duckdb]].

Referencia: https://pandas.pydata.org/docs/
