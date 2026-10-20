---
type: tech
kind: framework
title: FastAPI
layer: backend
language: python
use_when:
  - API REST o JSON async
  - microservicios y servicios que exponen modelos de ML
  - backend para SPA o app móvil
avoid_when:
  - sitio con renderizado server-side de HTML pesado
  - admin CRUD clásico con mucho formulario (mejor Django)
performs_best:
  - alta concurrencia I/O
  - validación tipada con pydantic y docs OpenAPI automáticas
related: [postgresql, pytest]
practices: [fastapi-structure]
checks: [fastapi-endpoint-tests]
tags: [api, rest, async, openapi]
---
# FastAPI

Framework async sobre Starlette + Pydantic. Ver [[fastapi-structure]].
