---
type: "check"
title: "Pruebas Go con detección de carreras"
kind: "test"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "go test -race ./..."
---

# Pruebas Go con detección de carreras

Ejecuta pruebas unitarias y de integración útiles desde la raíz del módulo en una plataforma compatible con el detector y con toolchain C cuando corresponda. Prepara bases de prueba explícitamente. Cubre cancelación, peticiones concurrentes y fallos de persistencia. Solo se comprueban rutas ejecutadas; ejecuta campañas fuzz acotadas aparte cuando proceda.

[Referencia oficial](https://go.dev/doc/articles/race_detector).
