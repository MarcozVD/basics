---
type: "tech"
kind: "library"
title: "database/sql"
layer: "data"
language: "go"
use_when: ["Acceso SQL Go mediante una interfaz estándar de drivers","Persistencia Go con SQL explícito y transacciones database/sql"]
avoid_when: ["Se exige un modelo de entidades generado","El requisito principal son APIs nativas de una base específica","Elegir un motor de base de datos o índice de texto completo en vez de una API cliente"]
performs_best: ["APIs Go estándar de pool SQL y transacciones"]
related: ["go","pgx","sqlc","postgresql","sqlite"]
practices: ["go-context","go-errors","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","database-sql"]
---

# database/sql

database/sql define acceso SQL Go sobre un driver elegido aparte, no un motor de base de datos ni una implementación de índices. sql.DB gestiona un pool; configúralo, cierra filas y revisa errores de iteración. Usa parámetros y métodos con contexto. Drivers y dialectos requieren pruebas con el motor real.

Notas relacionadas: [[go]], [[pgx]], [[sqlc]], [[postgresql]], [[sqlite]].

[Referencia oficial](https://go.dev/doc/database/).
