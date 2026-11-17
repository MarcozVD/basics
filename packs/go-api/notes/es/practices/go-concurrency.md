---
type: "practice"
title: "Concurrencia acotada Go"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Concurrencia acotada Go

Acota trabajo en curso con límites explícitos de workers o admisión, tamaño del pool y plazos. Define quién cierra canales y cómo paran workers; no crees goroutines ilimitadas por trabajo en cola. Libera recursos al cancelar y sincroniza estado mutable compartido. Prueba cierre y cancelación con el detector de carreras; solo detecta carreras en rutas ejecutadas.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Referencia oficial](https://go.dev/blog/pipelines).
