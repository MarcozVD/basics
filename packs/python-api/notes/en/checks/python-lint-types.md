---
type: check
title: Python lint and types
kind: lint
applies_to: [python]
command: ruff check . && ruff format --check . && mypy .
---
Passes without errors before the task is considered done.
