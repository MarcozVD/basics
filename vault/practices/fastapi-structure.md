---
type: practice
title: Estructura de proyecto FastAPI
applies_to: [fastapi]
---
- Routers por dominio en `app/routers/`, lógica en `app/services/`, sin lógica en endpoints.
- Esquemas Pydantic separados para entrada (`XCreate`) y salida (`XRead`); nunca devolver modelos ORM.
- Dependencias (`Depends`) para DB session, auth y config.
- Config con `pydantic-settings` desde variables de entorno.
- Endpoints `async` solo si todo I/O interno es async.
