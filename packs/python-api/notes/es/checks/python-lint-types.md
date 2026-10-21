---
type: check
title: Lint y tipos Python
kind: lint
applies_to: [python]
command: ruff check . && ruff format --check . && mypy .
---
Pasa sin errores antes de dar por terminada la tarea.

Empieza con este `ruff.toml` y ajusta las reglas al proyecto:

```toml file=ruff.toml
target-version = "py311"
line-length = 100

[lint]
select = ["E", "F", "I", "UP", "B", "SIM", "RUF"]
ignore = ["E501"]

[format]
quote-style = "double"
```
