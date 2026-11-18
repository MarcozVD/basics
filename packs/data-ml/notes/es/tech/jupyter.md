---
type: "tech"
kind: "library"
title: "Jupyter"
layer: "ml"
language: "python"
use_when: ["Análisis exploratorio Python en notebooks ejecutables","Investigación interactiva con narrativa y gráficos intermedios"]
avoid_when: ["Se exige un entrypoint batch de producción desatendido","No se tolera estado oculto sin ejecución limpia"]
performs_best: ["Exploración interactiva con código y narrativa"]
related: ["pandas","numpy","scikit-learn"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["jupyter","python","machine-learning"]
packages: {"pypi":["jupyter"]}
---

Los notebooks Jupyter combinan celdas ejecutables y narrativa. Reinicia y ejecuta todo desde un kernel limpio; mueve transformaciones reutilizables a módulos. Excluye datos privados, tokens y salidas pesadas del repositorio.

Notas relacionadas: [[pandas]], [[numpy]], [[scikit-learn]].

Referencia: https://docs.jupyter.org/en/latest/
