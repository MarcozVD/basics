---
type: "tech"
kind: "library"
title: "NumPy"
layer: "data"
language: "python"
use_when: ["numerical arrays and vectorized calculations","Dense numerical data with explicit shapes and dtypes"]
avoid_when: ["Labeled relational joins are the main abstraction","A persistent database server is required","Online transactional API persistence with relational application tables and rollbacks","Live records shared by concurrent users needing synchronized writes"]
performs_best: ["Array-oriented numerical operations"]
related: ["pandas","scikit-learn","pyarrow"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["numpy","data-analysis"]
packages: {"pypi":["numpy"]}
---

NumPy provides multidimensional arrays and numerical operations. Check shapes, broadcasting, dtype promotion and numerical tolerance. Vectorization can allocate large intermediate arrays; profile memory as well as runtime.

Related notes: [[pandas]], [[scikit-learn]], [[pyarrow]].

Reference: https://numpy.org/doc/
