---
type: "practice"
title: "Límites de errores Go"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Límites de errores Go

Devuelve errores con contexto útil de la operación y envuelve con %w cuando el llamador deba inspeccionar la causa. Usa errors.Is y errors.As en vez de comparar mensajes. Traduce fallos de dominio a estados HTTP estables, registra detalles internos una vez en un límite claro y excluye secretos de respuestas. Prueba rechazo y fallos de dependencias.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Referencia oficial](https://go.dev/blog/go1.13-errors).
