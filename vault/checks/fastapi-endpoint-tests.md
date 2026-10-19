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
