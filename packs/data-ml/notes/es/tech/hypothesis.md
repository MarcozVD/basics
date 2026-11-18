---
type: "tech"
kind: "library"
title: "Hypothesis"
layer: "testing"
language: "python"
use_when: ["Pruebas Python basadas en propiedades para transformar datos","Casos límite generados para funciones e invariantes Python"]
avoid_when: ["Solo se prueban interacciones de navegador extremo a extremo","Basta un único ejemplo fijo de regresión"]
performs_best: ["Ejemplos generados y reducción de entradas que fallan"]
related: ["pytest","numpy","pandera"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["hypothesis","python","python-validation"]
packages: {"pypi":["hypothesis"]}
---

Hypothesis genera ejemplos de propiedades declaradas y reduce fallos. Limita estrategias al dominio admitido, no filtres casos importantes y conserva regresiones útiles. Complementa pytest; no infiere la propiedad correcta.

Notas relacionadas: [[pytest]], [[numpy]], [[pandera]].

Referencia: https://hypothesis.readthedocs.io/en/latest/
