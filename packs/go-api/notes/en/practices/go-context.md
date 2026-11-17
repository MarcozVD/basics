---
type: "practice"
title: "Go request context propagation"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Go request context propagation

Pass context.Context explicitly from the incoming request through service and database calls. Derive deadlines deliberately and call cancellation functions when finished. Do not replace a live request context with Background inside a helper. Keep request-scoped values limited to metadata. With frameworks outside net/http, inspect their context lifecycle and use the documented propagation API.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Official reference](https://pkg.go.dev/context).
