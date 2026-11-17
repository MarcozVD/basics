---
type: tech
kind: database
packages:
  npm: [pg]
  pypi: [psycopg, psycopg2, psycopg2-binary, asyncpg]
title: PostgreSQL
layer: data
use_when:
  - datos relacionales con transacciones
  - SaaS, CRUD, ecommerce
  - búsqueda full-text o datos geoespaciales moderados
avoid_when:
  - caché efímera de muy baja latencia (mejor Redis)
performs_best:
  - consistencia ACID e integridad referencial
  - consultas complejas y JSONB
practices: [sql-migrations]
tags: [sql, relacional, base-de-datos]
---
# PostgreSQL

Base de datos por defecto para proyectos con datos relacionales.
