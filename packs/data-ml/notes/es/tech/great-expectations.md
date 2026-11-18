---
type: "tech"
kind: "library"
title: "Great Expectations"
layer: "testing"
language: "python"
use_when: ["Expectativas de calidad de datasets batch Python con resultados registrados","Suites reutilizables de calidad entre ejecuciones de ingestión"]
avoid_when: ["Una función pequeña solo necesita pruebas unitarias","La fuente o backend requerido no está soportado"]
performs_best: ["Expectativas reutilizables e informes de validación"]
related: ["pandera","pytest","pandas"]
practices: ["data-boundary-validation","ml-reproducibility","python-typing"]
checks: ["python-lint-types","data-ml-tests"]
tags: ["great-expectations","python","python-validation"]
packages: {"pypi":["great_expectations"]}
---

Great Expectations valida datos contra suites de expectativas. Verifica conectores y backend, define fallos y evita datos sensibles en informes. Pasar expectativas solo demuestra las restricciones declaradas.

Notas relacionadas: [[pandera]], [[pytest]], [[pandas]].

Referencia: https://docs.greatexpectations.io/docs/
