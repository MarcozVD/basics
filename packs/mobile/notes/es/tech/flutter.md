---
type: "tech"
kind: "framework"
title: "Flutter"
layer: "mobile"
language: "dart"
use_when: ["Apps Flutter con UI de widgets compartida entre plataformas móviles","Apps móviles Dart con widgets declarativos"]
avoid_when: ["Deben reutilizarse directamente módulos React Native y componentes React","Solo se permite UI nativa de plataforma","La entrega es una API de servidor o UI web solo de navegador"]
performs_best: ["Composición de widgets Dart y herramientas móviles integradas"]
related: ["dart","drift","riverpod","flutter-test"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","flutter"]
---

# Flutter

Flutter construye interfaces con widgets Dart. Separa renderizado, estado y persistencia, comprueba plugins por plataforma y prueba integraciones en dispositivos. Compartir UI no elimina permisos, accesibilidad ni trabajo de release específico.

Notas relacionadas: [[dart]], [[drift]], [[riverpod]], [[flutter-test]].

[Referencia oficial](https://docs.flutter.dev/).
