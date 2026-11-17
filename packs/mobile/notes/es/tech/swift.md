---
type: "tech"
kind: "language"
title: "Swift"
layer: "mobile"
language: "swift"
use_when: ["Se necesitan módulos cliente Apple tipados con opcionales","Se consumen APIs de plataforma Apple directamente"]
avoid_when: ["Se exige un compilador Dart o Kotlin","Android es el único destino UI","La entrega es una API de servidor o UI web solo de navegador"]
performs_best: ["Modelos tipados e integración directa con APIs Apple"]
related: ["swiftui","kotlin","dart"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Swift

Swift ofrece modelos tipados, opcionales y concurrencia. Separa lenguaje de framework UI y comprueba disponibilidad de APIs. Las anotaciones de concurrencia no sustituyen pruebas de cancelación ni persistencia.

Notas relacionadas: [[swiftui]], [[kotlin]], [[dart]].

[Referencia oficial](https://docs.swift.org/swift-book/documentation/the-swift-programming-language/).
