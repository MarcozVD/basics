---
type: check
title: FastAPI endpoint tests
kind: test
applies_to: [fastapi]
command: pytest -q
---
Every new endpoint must have `TestClient` tests covering:

1. Happy path with status and body validated against the output schema.
2. Invalid input returns 422.
3. Missing auth returns 401/403 when the endpoint is protected.
4. Missing resource returns 404.
