---
type: practice
title: Python typing
applies_to: [python]
---
- Type hints on every public function; `mypy --strict` or `pyright` in CI.
- Data models with `pydantic` or `dataclasses`, not loose dicts.
- Manage dependencies with `uv` and `pyproject.toml`.
