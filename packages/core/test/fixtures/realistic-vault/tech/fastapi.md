---
type: tech
kind: framework
title: FastAPI
layer:
  - backend
language: python
tags:
  - api
  - rest
  - async
  - openapi
use_when:
  - API REST o JSON asíncrona
  - microservicios y servicios que exponen modelos de ML
  - backend para una SPA o una app móvil
avoid_when:
  - sitios con mucho renderizado HTML en el servidor
performs_best:
  - alta concurrencia de E/S
  - validación tipada con pydantic
source: manual
updated: "2026-01-15"
---

# FastAPI

Framework async sobre Starlette y Pydantic.
