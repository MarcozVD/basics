---
type: "tech"
kind: "language"
title: "Dart"
layer: "mobile"
language: "dart"
use_when: ["Se busca un lenguaje cliente con null safety y funciones asíncronas","Paquetes cliente tipados comparten modelos de dominio"]
avoid_when: ["Se exige un compilador Kotlin o Swift","La UI React existente debe ejecutarse sin cambios","La entrega es una API de servidor o UI web solo de navegador"]
performs_best: ["Modelos cliente con null safety y APIs asíncronas"]
related: ["flutter","riverpod","bloc"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Dart

Dart ofrece modelos tipados, null safety y APIs asíncronas. Separa validación en ejecución de tipos estáticos. Flutter es un framework que usa el lenguaje; elige sus herramientas de widgets y plataforma aparte.

Notas relacionadas: [[flutter]], [[riverpod]], [[bloc]].

[Referencia oficial](https://dart.dev/language).
