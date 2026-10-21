---
type: practice
title: FastAPI project structure
applies_to: [fastapi]
---
- Domain routers in `app/routers/`, logic in `app/services/`, no logic in endpoints.
- Separate Pydantic schemas for input (`XCreate`) and output (`XRead`); never return ORM models.
- Dependencies (`Depends`) for DB session, auth and config.
- Config with `pydantic-settings` from environment variables.
- `async` endpoints only when all internal I/O is async.
