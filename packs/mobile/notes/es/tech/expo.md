---
type: "tech"
kind: "framework"
title: "Expo"
layer: "mobile"
language: "typescript"
use_when: ["Flujos Expo para apps móviles React Native","Builds móviles con módulos Expo y development builds"]
avoid_when: ["La app no puede adoptar configuración ni herramientas Expo","Se exige un framework de UI Dart o nativo de plataforma","La entrega es una API de servidor o UI web solo de navegador","Dashboards web React con componentes DOM de navegador"]
performs_best: ["Herramientas React Native y flujos coordinados de módulos"]
related: ["react-native","typescript","async-storage","jest"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","expo"]
---

# Expo

Expo aporta herramientas y módulos para React Native. Comprueba soporte de módulos nativos y usa development builds al necesitar capacidades propias. Una actualización JavaScript no sustituye todos los cambios del binario; revisa compatibilidad de runtime antes de publicar.

Notas relacionadas: [[react-native]], [[typescript]], [[async-storage]], [[jest]].

[Referencia oficial](https://docs.expo.dev/).
