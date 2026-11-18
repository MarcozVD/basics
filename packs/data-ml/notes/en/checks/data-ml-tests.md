---
type: "check"
title: "Python data transformation and model tests"
applies_to: ["python"]
command: "pytest -q"
---

Run deterministic unit/property and schema tests on small local fixtures. Check split disjointness, fitted-transform boundaries, schema failures and round trips. Avoid downloading datasets or contacting services in the default suite. Run [[python-lint-types]] for Ruff and mypy separately.
