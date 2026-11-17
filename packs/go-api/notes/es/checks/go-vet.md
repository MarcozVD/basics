---
type: "check"
title: "Go vet"
kind: "lint"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
command: "go vet ./..."
---

# Go vet

Ejecuta desde la raíz del módulo Go. Vet examina construcciones sospechosas; no demuestra corrección en ejecución. Explicita plataforma y build tags en CI. Revisa hallazgos sin suprimir grupos enteros de analizadores.

[Referencia oficial](https://pkg.go.dev/cmd/vet).
