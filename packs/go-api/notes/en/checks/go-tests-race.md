---
type: "check"
title: "Go tests with race detection"
kind: "test"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "go test -race ./..."
---

# Go tests with race detection

Run meaningful unit and integration tests from the module root on a supported race-detector platform, with the required C toolchain where applicable. Provision test databases explicitly. Cover cancellation, concurrent requests and persistence failures. A passing run only checks executed paths; run bounded fuzz campaigns separately when relevant.

[Official reference](https://go.dev/doc/articles/race_detector).
