---
type: "check"
title: "Lint configurado Go"
kind: "lint"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "golangci-lint run"
---

# Lint configurado Go

Requiere golangci-lint instalado aparte, compatible con el toolchain, y configuración revisada. Fija versión en CI y elige linters explícitamente. Este comando no promete verificar formato: configura esa política por separado. Esta nota no instala herramientas.

[Referencia oficial](https://golangci-lint.run/docs/).
