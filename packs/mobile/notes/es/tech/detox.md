---
type: "tech"
kind: "tool"
title: "Detox"
layer: "testing"
language: "typescript"
use_when: ["Flujos móviles React Native sobre una app compilada","Escenarios nativos end-to-end con sincronización de la app"]
avoid_when: ["Solo se necesita cubrir lógica pura de módulos","No se puede preparar un build y simulador compatibles"]
performs_best: ["Interacciones end-to-end de apps React Native"]
related: ["react-native","expo","jest"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","detox"]
---

# Detox

Detox automatiza builds nativos compatibles con interacciones sincronizadas. Configura variantes, simuladores/emuladores y cuentas de prueba. La sincronización ayuda, pero no demuestra que todo flujo asíncrono sea determinista.

Notas relacionadas: [[react-native]], [[expo]], [[jest]].

[Referencia oficial](https://wix.github.io/Detox/).
