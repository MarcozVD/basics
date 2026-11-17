---
type: "tech"
kind: "library"
title: "pgx"
layer: "data"
language: "go"
use_when: ["Acceso Go a PostgreSQL con driver nativo","Servicio Go que necesita operaciones específicas de PostgreSQL"]
avoid_when: ["La base exigida es SQLite","Se exige un modelo de entidades independiente del motor"]
performs_best: ["Consultas Go explícitas a PostgreSQL y opciones de pooling"]
related: ["go","database-sql","sqlc","postgresql"]
practices: ["go-context","go-errors","go-concurrency"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","pgx"]
---

# pgx

pgx proporciona un driver PostgreSQL Go con interfaz nativa y adaptador database/sql. Elige la interfaz, usa pgxpool cuando necesites pool y propaga cancelación a consultas y transacciones. Prueba con PostgreSQL y no con SQLite como sustituto.

Notas relacionadas: [[go]], [[database-sql]], [[sqlc]], [[postgresql]].

[Referencia oficial](https://pkg.go.dev/github.com/jackc/pgx/v5).
