---
type: "tech"
kind: "library"
title: "unittest"
layer: "testing"
language: "python"
use_when: ["Casos Python de biblioteca estándar sin dependencia de runner externo","Suites Python TestCase existentes con preparación y aserciones explícitas"]
avoid_when: ["La tarea completa es validar dataframes declarativamente","Se requiere automatización de navegador o dispositivo nativo"]
performs_best: ["Casos y aserciones de biblioteca estándar"]
related: ["python","pytest","hypothesis"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["unittest","python","python-validation"]
---

unittest aporta casos, fixtures y descubrimiento Python. Aísla pruebas deterministas, parchea donde se consulta y prueba comportamiento público. Es otro estilo de runner, no sustituye esquemas ni generación de propiedades.

Notas relacionadas: [[python]], [[pytest]], [[hypothesis]].

Referencia: https://docs.python.org/3/library/unittest.html
