---
type: "tech"
kind: "tool"
title: "Ent"
layer: "data"
language: "go"
use_when: ["Clientes Go tipados de entidades generados desde esquemas","Relaciones Go expresadas como aristas del esquema"]
avoid_when: ["No se desea un generador basado en esquemas","Los archivos SQL deben ser la única abstracción de persistencia"]
performs_best: ["APIs Go de entidades generadas y navegación de relaciones"]
related: ["go","gorm","sqlc","postgresql","sqlite"]
practices: ["go-layout","go-errors","go-context"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","ent"]
---

# Ent

Ent genera clientes Go desde definiciones de esquema. Fija herramientas, revisa cambios de esquema y migraciones y prueba restricciones en el motor elegido. Los tipos generados no eliminan la revisión de consultas y transacciones.

Notas relacionadas: [[go]], [[gorm]], [[sqlc]], [[postgresql]], [[sqlite]].

[Referencia oficial](https://entgo.io/docs/getting-started/).
