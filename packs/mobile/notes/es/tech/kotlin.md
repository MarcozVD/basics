---
type: "tech"
kind: "language"
title: "Kotlin"
layer: "mobile"
language: "kotlin"
use_when: ["Se necesitan interoperabilidad JVM y tipos conscientes de null","Paquetes Android tipados comparten lógica de dominio"]
avoid_when: ["Se exige un compilador Dart o Swift","La entrega es solo una UI de navegador","La entrega es una API de servidor o UI web solo de navegador"]
performs_best: ["Modelos tipados e interoperabilidad JVM"]
related: ["jetpack-compose","swift","dart"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["typed-client","language-design"]
---

# Kotlin

Kotlin ofrece tipos conscientes de null e interoperabilidad Java. En apps Android elige herramientas UI y de ciclo de vida. Coroutines y estado concurrente siguen requiriendo decisiones de cancelación, propiedad y límites.

Notas relacionadas: [[jetpack-compose]], [[swift]], [[dart]].

[Referencia oficial](https://kotlinlang.org/docs/home.html).
