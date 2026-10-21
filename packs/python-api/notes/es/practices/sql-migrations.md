---
type: practice
title: Migraciones SQL
applies_to: [postgresql]
---
- Todo cambio de esquema vía migraciones versionadas (Alembic, Prisma, Drizzle).
- Migraciones reversibles; nunca editar una migración ya aplicada.
- Índices para toda foreign key y columna de filtro frecuente.
