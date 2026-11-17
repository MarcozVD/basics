---
type: "check"
title: "Go vet"
kind: "lint"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "go vet ./..."
---

# Go vet

Run from the Go module root. Vet examines suspicious constructs; it does not prove runtime correctness. Keep the target platform and build tags explicit in CI. Review findings rather than suppressing whole analyzer groups.

[Official reference](https://pkg.go.dev/cmd/vet).
