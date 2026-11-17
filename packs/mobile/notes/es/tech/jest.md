---
type: "tech"
kind: "tool"
title: "Jest"
layer: "testing"
language: "typescript"
use_when: ["Lógica de módulos React Native y aislamiento con mocks","Proyectos de componentes nativos con preset Jest"]
avoid_when: ["Debe demostrarse comportamiento real de permisos","Se exige un harness de widgets Flutter"]
performs_best: ["Aislamiento de módulos JavaScript y mocks configurables"]
related: ["react-native","react-native-testing-library","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","jest"]
---

# Jest

Jest ejecuta pruebas JavaScript/TypeScript con transforms y presets del proyecto. Los mocks nativos no demuestran comportamiento nativo; combina lógica y cobertura en dispositivos. Revisa snapshots y evita mocks que oculten errores.

Notas relacionadas: [[react-native]], [[react-native-testing-library]], [[detox]].

[Referencia oficial](https://jestjs.io/docs/tutorial-react-native).
