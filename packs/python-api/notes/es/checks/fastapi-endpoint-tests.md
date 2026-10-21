---
type: check
title: Tests de endpoints FastAPI
kind: test
applies_to: [fastapi]
command: pytest -q
---
Cada endpoint nuevo debe tener tests con `TestClient` que cubran:

1. Caso feliz con status y cuerpo validado contra el esquema de salida.
2. Entrada inválida devuelve 422.
3. Sin auth devuelve 401/403 cuando el endpoint está protegido.
4. Recurso inexistente devuelve 404.

Empieza con esta plantilla y adáptala al proyecto:

```python file=tests/test_health.py
# Adapta este import a donde esté definida tu app FastAPI.
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
