---
type: "tech"
kind: "library"
title: "Jupyter"
layer: "ml"
language: "python"
use_when: ["Python exploratory data analysis in executable notebooks","Interactive investigation with narrative and intermediate plots"]
avoid_when: ["An unattended production batch entrypoint is required","Hidden notebook state cannot be tolerated without clean execution"]
performs_best: ["Interactive exploration with code and narrative"]
related: ["pandas","numpy","scikit-learn"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["jupyter","python","machine-learning"]
packages: {"pypi":["jupyter"]}
---

Jupyter notebooks combine executable cells and narrative. Restart and run all cells from a clean kernel; move reusable transformations into modules. Keep private data, tokens and bulky outputs out of committed notebooks.

Related notes: [[pandas]], [[numpy]], [[scikit-learn]].

Reference: https://docs.jupyter.org/en/latest/
