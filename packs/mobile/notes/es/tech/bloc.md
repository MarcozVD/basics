---
type: "tech"
kind: "library"
title: "Bloc"
layer: "data"
language: "dart"
use_when: ["Estado móvil Flutter con eventos y transiciones explícitos","Lógica de pantallas Dart con secuencias observables de estado"]
avoid_when: ["Basta un valor local sencillo","Se necesita una base o un motor de sincronización"]
performs_best: ["Modelado explícito de eventos/estado y pruebas de transiciones"]
related: ["flutter","riverpod","drift"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","bloc"]
---

# Bloc

Bloc organiza lógica Dart en transiciones; elige Bloc o Cubit según complejidad. Prueba cancelación y secuencias de fallo y separa persistencia de presentación. Más clases no implican mejor diseño del estado.

Notas relacionadas: [[flutter]], [[riverpod]], [[drift]].

[Referencia oficial](https://bloclibrary.dev/).
