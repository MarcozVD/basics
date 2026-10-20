---
type: check
title: Lint y tipos Python
kind: lint
applies_to: [python]
command: ruff check . && ruff format --check . && mypy .
---
Pasa sin errores antes de dar por terminada la tarea.
