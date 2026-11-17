---
type: practice
title: SQL migrations
applies_to: [postgresql]
---
- Every schema change through versioned migrations (Alembic, Prisma, Drizzle).
- Reversible migrations; never edit a migration that has already been applied.
- Indexes on every foreign key and frequently filtered column.
