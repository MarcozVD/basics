---
type: "tech"
kind: "library"
title: "React Native Testing Library"
layer: "testing"
language: "typescript"
use_when: ["Interacciones de componentes React Native mediante consultas accesibles","Aserciones de UI nativa centradas en comportamiento visible"]
avoid_when: ["Se verifica un binario real o flujo de permisos del sistema","Se prueban widgets Flutter","Pruebas de componentes React del navegador con DOM"]
performs_best: ["Interacciones de componentes con consultas orientadas a accesibilidad"]
related: ["react-native","jest","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","react-native-testing-library"]
---

# React Native Testing Library

React Native Testing Library ejercita componentes sin sustituir dispositivos. Consulta roles/etiquetas accesibles, verifica resultados visibles y espera cambios asíncronos. No demuestra layout nativo, diálogos del sistema ni hardware.

Notas relacionadas: [[react-native]], [[jest]], [[detox]].

[Referencia oficial](https://oss.callstack.com/react-native-testing-library/).
