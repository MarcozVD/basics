---
type: "check"
title: "Go configured lint checks"
kind: "lint"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "golangci-lint run"
---

# Go configured lint checks

Requires a separately installed golangci-lint version compatible with the project toolchain and a reviewed configuration. Pin that version in CI and choose linters deliberately. This command is not a promise that formatting is checked: configure the project's formatter policy separately. No tool is installed by this note.

[Official reference](https://golangci-lint.run/docs/).
