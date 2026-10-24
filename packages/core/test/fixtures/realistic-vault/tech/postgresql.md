---
type: tech
kind: database
title: PostgreSQL
layer:
  - data
tags:
  - sql
  - relacional
  - database
use_when:
  - datos relacionales con transacciones
  - SaaS, CRUD y ecommerce
  - búsqueda full-text o datos geoespaciales moderados
avoid_when:
  - caché efímera de latencia muy baja (mejor [[redis]])
performs_best:
  - consistencia ACID e integridad referencial
  - consultas complejas y JSONB
source: manual
updated: "2026-01-15"
---

# PostgreSQL

Base de datos por defecto con datos relacionales.
