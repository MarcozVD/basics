---
type: "tech"
kind: "library"
title: "Riverpod"
layer: "data"
language: "dart"
use_when: ["Estado de pantallas Flutter y dependencias como providers","Estado asíncrono móvil Dart con propiedad acotada"]
avoid_when: ["El componente que falta es almacenamiento duradero","Se exige un modelo Bloc explícito de eventos y estado"]
performs_best: ["Dependencias acotadas a providers y estado asíncrono"]
related: ["flutter","drift","bloc"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","riverpod"]
---

# Riverpod

Riverpod modela estado y dependencias con providers. Define ámbitos y liberación, prueba transiciones de carga/error y separa persistencia duradera. Un provider no conserva registros tras reiniciar por sí solo.

Notas relacionadas: [[flutter]], [[drift]], [[bloc]].

[Referencia oficial](https://riverpod.dev/).
