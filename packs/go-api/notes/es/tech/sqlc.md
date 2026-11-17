---
type: "tech"
kind: "tool"
title: "sqlc"
layer: "data"
language: "go"
use_when: ["Código Go tipado de consultas generado desde SQL","Proyecto Go que conserva consultas SQL como fuente de verdad"]
avoid_when: ["El equipo no puede mantener un paso de generación","Se prefiere mapear entidades en ejecución"]
performs_best: ["Métodos Go y tipos de parámetros generados para consultas"]
related: ["go","database-sql","pgx","postgresql","sqlite"]
practices: ["go-layout","go-context","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","sqlc"]
---

# sqlc

sqlc genera código Go desde consultas y esquemas SQL. Haz reproducible la generación, elige motor y driver compatibles y revisa cambios generados. Generar no aplica migraciones ni demuestra comportamiento con datos de producción.

Notas relacionadas: [[go]], [[database-sql]], [[pgx]], [[postgresql]], [[sqlite]].

[Referencia oficial](https://docs.sqlc.dev/).
