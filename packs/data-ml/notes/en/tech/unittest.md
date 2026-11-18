---
type: "tech"
kind: "library"
title: "unittest"
layer: "testing"
language: "python"
use_when: ["Python standard-library test cases without an external test runner dependency","Existing Python TestCase suites with explicit setup and assertions"]
avoid_when: ["Declarative dataframe validation is the whole task","Browser or native-device automation is required"]
performs_best: ["Standard-library test cases and assertions"]
related: ["python","pytest","hypothesis"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["unittest","python","python-validation"]
---

unittest provides Python test cases, fixtures and discovery. Keep tests isolated and deterministic; patch at the lookup location and prefer testing public behavior. It is an alternative runner style, not a replacement for dataset schemas or property generation.

Related notes: [[python]], [[pytest]], [[hypothesis]].

Reference: https://docs.python.org/3/library/unittest.html
