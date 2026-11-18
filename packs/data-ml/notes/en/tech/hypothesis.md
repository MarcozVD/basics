---
type: "tech"
kind: "library"
title: "Hypothesis"
layer: "testing"
language: "python"
use_when: ["Python property-based tests for data transformations","Generated edge cases for pure Python functions and invariants"]
avoid_when: ["Only browser end-to-end interactions are under test","A fixed regression example alone is sufficient"]
performs_best: ["Generated examples and shrinking failing inputs"]
related: ["pytest","numpy","pandera"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["hypothesis","python","python-validation"]
packages: {"pypi":["hypothesis"]}
---

Hypothesis generates examples for stated properties and reduces failures. Bound strategies to the supported domain, avoid filtering away important cases and preserve useful failures as regression examples. It complements pytest; it does not infer the correct property.

Related notes: [[pytest]], [[numpy]], [[pandera]].

Reference: https://hypothesis.readthedocs.io/en/latest/
