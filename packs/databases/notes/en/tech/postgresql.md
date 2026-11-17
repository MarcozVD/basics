---
type: tech
kind: database
packages:
  npm: [pg]
  pypi: [psycopg, psycopg2, psycopg2-binary, asyncpg]
title: PostgreSQL
layer: data
use_when:
  - relational data with transactions
  - SaaS, CRUD, ecommerce
  - full-text search or moderate geospatial data
avoid_when:
  - ephemeral very low-latency cache (Redis is better)
performs_best:
  - ACID consistency and referential integrity
  - complex queries and JSONB
practices: [sql-migrations]
tags: [sql, relational, database]
---
# PostgreSQL

Default database for projects with relational data.
