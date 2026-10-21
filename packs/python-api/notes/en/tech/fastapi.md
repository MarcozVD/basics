---
type: tech
kind: framework
title: FastAPI
layer: backend
language: python
use_when:
  - async REST or JSON API
  - microservices and services that expose ML models
  - backend for a SPA or mobile app
avoid_when:
  - sites with heavy server-side HTML rendering
  - classic CRUD admin with lots of forms (Django is better)
performs_best:
  - high I/O concurrency
  - typed validation with pydantic and automatic OpenAPI docs
related: [postgresql, pytest]
practices: [fastapi-structure]
checks: [fastapi-endpoint-tests]
tags: [api, rest, async, openapi]
---
# FastAPI

Async framework on top of Starlette + Pydantic. See [[fastapi-structure]].
