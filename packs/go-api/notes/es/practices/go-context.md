---
type: "practice"
title: "Propagación de contexto de peticiones Go"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Propagación de contexto de peticiones Go

Pasa context.Context explícitamente desde la petición a servicios y consultas. Deriva plazos y llama a las funciones de cancelación al terminar. No sustituyas el contexto de una petición activa por Background en un helper. Limita los valores del contexto a metadatos. Fuera de net/http, revisa el ciclo de vida y la API documentada del framework.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Referencia oficial](https://pkg.go.dev/context).
