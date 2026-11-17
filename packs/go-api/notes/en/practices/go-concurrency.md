---
type: "practice"
title: "Go bounded concurrency"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Go bounded concurrency

Bound in-flight work with explicit worker or admission limits, database pool sizes and deadlines. Define who closes channels and how workers stop; do not create an unbounded goroutine per queued job. Release resources on cancellation and avoid shared mutable state without synchronization. Test shutdown and cancellation under the race detector; it only reports races on executed paths.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Official reference](https://go.dev/blog/pipelines).
