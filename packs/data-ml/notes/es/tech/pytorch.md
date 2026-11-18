---
type: "tech"
kind: "library"
title: "PyTorch"
layer: "ml"
language: "python"
use_when: ["Entrenamiento Python de redes neuronales con diferenciación automática","Modelos tensoriales propios y bucles explícitos"]
avoid_when: ["Basta un baseline tabular clásico pequeño","Solo se necesita seguimiento de experimentos"]
performs_best: ["Cálculo tensorial y entrenamiento neuronal propio"]
related: ["numpy","mlflow","scikit-learn"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["pytorch","python","machine-learning"]
packages: {"pypi":["torch"]}
---

PyTorch aporta tensores, diferenciación automática y módulos neuronales. Separa modos de entrenamiento/evaluación, gestiona dispositivos y gradientes y registra dependencias. Las semillas no prometen resultados idénticos entre dispositivos o versiones.

Notas relacionadas: [[numpy]], [[mlflow]], [[scikit-learn]].

Referencia: https://docs.pytorch.org/docs/stable/index.html
