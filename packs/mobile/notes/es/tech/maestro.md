---
type: "tech"
kind: "tool"
title: "Maestro"
layer: "testing"
use_when: ["Flujos móviles en dispositivos expresados en YAML","Navegación de app como caja negra entre pantallas nativas"]
avoid_when: ["El objetivo son aserciones unitarias finas","La app no puede exponer selectores accesibles estables"]
performs_best: ["Flujos declarativos de interacción móvil"]
related: ["react-native","flutter","detox"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: []
tags: ["mobile","maestro"]
---

# Maestro

Maestro automatiza flujos con YAML. Usa selectores accesibles estables, reinicia estado y prepara fixtures deterministas. Su lenguaje de flujos es independiente de la implementación; prueba permisos y diferencias de plataforma explícitamente.

Notas relacionadas: [[react-native]], [[flutter]], [[detox]].

[Referencia oficial](https://docs.maestro.dev/).
