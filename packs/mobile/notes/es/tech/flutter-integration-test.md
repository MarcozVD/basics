---
type: "tech"
kind: "library"
title: "Flutter integration_test"
layer: "testing"
language: "dart"
use_when: ["Flujos de app Flutter en dispositivo o emulador","Comportamiento de plugins y navegación fuera del aislamiento de widgets"]
avoid_when: ["Una prueba unitaria o de widget demuestra la misma propiedad","No hay target o build compatible disponible","Comprobaciones unitarias al guardar sin compilar ni iniciar una app"]
performs_best: ["Integración de app Flutter en targets configurados"]
related: ["flutter","flutter-test","maestro"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter-integration-test"]
---

# Flutter integration_test

integration_test ejercita una app Flutter compilada en targets configurados. Prepara dispositivos, datos y permisos y explicita setup. Ejecutar una plataforma no demuestra compatibilidad con todos los dispositivos.

Notas relacionadas: [[flutter]], [[flutter-test]], [[maestro]].

[Referencia oficial](https://docs.flutter.dev/testing/integration-tests).
