---
type: "tech"
kind: "library"
title: "flutter_test"
layer: "testing"
language: "dart"
use_when: ["Comportamiento de widgets Flutter en un entorno controlado","Lógica cliente Dart y aserciones del árbol de widgets"]
avoid_when: ["Debe demostrarse integración nativa del sistema","Se exige un runner integrado que repita pruebas al guardar"]
performs_best: ["Frames controlados de widgets Flutter y aserciones"]
related: ["flutter","dart","flutter-integration-test"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter-test"]
---

# flutter_test

flutter_test aporta utilidades Flutter y pumping de widgets. Controla relojes y trabajo asíncrono y distingue widgets de una app nativa en ejecución. Vigilar archivos requiere orquestar la invocación; la integración nativa requiere dispositivos.

Notas relacionadas: [[flutter]], [[dart]], [[flutter-integration-test]].

[Referencia oficial](https://api.flutter.dev/flutter/flutter_test/).
