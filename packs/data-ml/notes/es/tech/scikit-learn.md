---
type: "tech"
kind: "library"
title: "scikit-learn"
layer: "ml"
language: "python"
use_when: ["Entrenamiento Python de clasificador tabular con partición reservada","Modelos supervisados clásicos con pipelines y validación cruzada"]
avoid_when: ["El centro es entrenar redes neuronales personalizadas","Se necesita un framework HTTP en vez de entrenar modelos"]
performs_best: ["Estimadores, preprocesamiento y evaluación componibles"]
related: ["pandas","numpy","mlflow","hypothesis"]
practices: ["ml-reproducibility","ml-split-leakage","notebooks-to-modules"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["scikit-learn","python","machine-learning"]
packages: {"pypi":["scikit-learn"]}
---

scikit-learn ofrece estimadores, pipelines y selección de modelos. Separa datos antes de ajustar preprocesamiento, usa entrenamiento/validación para optimizar y reserva test intacto. Elige métricas y documenta desbalance y dependencias temporales o por grupo.

Notas relacionadas: [[pandas]], [[numpy]], [[mlflow]], [[hypothesis]].

Referencia: https://scikit-learn.org/stable/
