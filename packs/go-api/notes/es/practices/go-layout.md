---
type: "practice"
title: "Organización de proyectos API Go"
applies_to: ["go","net-http","gin","echo","chi","fiber","slog","zap","zerolog","database-sql","pgx","sqlc","gorm","ent","go-test","testify","gomock","httptest","go-fuzzing"]
---

# Organización de proyectos API Go

Empieza con un módulo Go y paquetes organizados por comportamiento. Separa adaptadores HTTP del dominio y la persistencia. Usa cmd e internal cuando aclaren ejecutables y límites, no como capas obligatorias. Conserva go.mod y go.sum, haz reproducible la generación y revisa sus cambios. Aplica gofmt; gofmt -l lista archivos, pero por sí solo no falla si falta formato.

[[go-vet]], [[go-lint]], [[go-tests-race]].

[Referencia oficial](https://go.dev/doc/modules/layout).
