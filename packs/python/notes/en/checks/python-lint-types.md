---
type: check
title: Python lint and types
kind: lint
applies_to: [python]
command: ruff check . && ruff format --check . && mypy .
---
Passes without errors before the task is considered done.

Start from this `ruff.toml` and adjust the rules to the project:

```toml file=ruff.toml
target-version = "py311"
line-length = 100

[lint]
select = ["E", "F", "I", "UP", "B", "SIM", "RUF"]
ignore = ["E501"]

[format]
quote-style = "double"
```
