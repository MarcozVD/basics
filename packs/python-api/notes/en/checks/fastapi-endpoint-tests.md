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

Start from this template and adapt it to the project:

```python file=tests/test_health.py
# Adapt this import to where your FastAPI app is defined.
from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)


def test_read_item_ok():
    response = client.get("/items/1")
    assert response.status_code == 200
    assert response.json()["id"] == 1


def test_read_item_missing():
    response = client.get("/items/999")
    assert response.status_code == 404


def test_create_item_invalid():
    response = client.post("/items", json={})
    assert response.status_code == 422
```
