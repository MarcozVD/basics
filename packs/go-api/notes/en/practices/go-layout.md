---
type: "practice"
title: "Go API project layout"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Go API project layout

Start with one Go module and packages organized around behavior. Keep HTTP adapters separate from domain and persistence decisions. Use cmd and internal when they clarify executable entry points and ownership, not as mandatory layers for every service. Commit go.mod and go.sum, keep code generation reproducible and review generated changes. Apply gofmt to source; gofmt -l lists files but alone does not fail a check when files need formatting.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Official reference](https://go.dev/doc/modules/layout).
