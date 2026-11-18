---
type: "tech"
kind: "library"
title: "Great Expectations"
layer: "testing"
language: "python"
use_when: ["Python batch dataset quality expectations with validation results","Reusable data-quality suites across ingestion runs"]
avoid_when: ["A tiny pure function needs only unit tests","The required data source or execution backend is unsupported"]
performs_best: ["Reusable dataset expectations and validation reports"]
related: ["pandera","pytest","pandas"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["great-expectations","python","python-validation"]
packages: {"pypi":["great_expectations"]}
---

Great Expectations validates data against expectation suites. Verify connector and backend support, define failure handling and prevent sensitive records from leaking into reports. Passing expectations only establishes the constraints actually declared.

Related notes: [[pandera]], [[pytest]], [[pandas]].

Reference: https://docs.greatexpectations.io/docs/
