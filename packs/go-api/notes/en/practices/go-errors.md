---
type: "practice"
title: "Go error boundaries"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Go error boundaries

Return errors with useful operation context and wrap with %w when callers should inspect the cause. Use errors.Is and errors.As rather than matching messages. Translate domain failures to stable HTTP statuses, log internal details once at an ownership boundary and keep secrets out of responses. Add rejected-input and dependency-failure cases.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Official reference](https://go.dev/blog/go1.13-errors).
