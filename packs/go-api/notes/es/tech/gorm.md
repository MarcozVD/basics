---
type: "tech"
kind: "library"
title: "GORM"
layer: "data"
language: "go"
use_when: ["Persistencia Go con modelos basados en structs","Aplicación Go con asociaciones y hooks ORM"]
avoid_when: ["La interfaz exigida es SQL escrito a mano","No se acepta comportamiento implícito de consultas"]
performs_best: ["Persistencia Go orientada a modelos y asociaciones"]
related: ["go","database-sql","ent","postgresql","sqlite"]
practices: ["go-errors","go-context","go-layout"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","gorm"]
---

# GORM

GORM traduce modelos Go a operaciones relacionales. Revisa SQL emitido, transacciones y carga de asociaciones. Trata migraciones de producción como cambios revisados; las facilidades automáticas no sustituyen un plan de despliegue.

Notas relacionadas: [[go]], [[database-sql]], [[ent]], [[postgresql]], [[sqlite]].

[Referencia oficial](https://gorm.io/docs/).
