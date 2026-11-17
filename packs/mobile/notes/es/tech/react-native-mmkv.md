---
type: "tech"
kind: "library"
title: "React Native MMKV"
layer: "data"
language: "typescript"
use_when: ["Preferencias móviles React Native con API de almacenamiento síncrona","Persistencia cliente nativa clave-valor con serialización explícita"]
avoid_when: ["Un conjunto relacional grande requiere joins y migraciones","No se puede instalar una dependencia de almacenamiento nativa"]
performs_best: ["Acceso nativo síncrono clave-valor"]
related: ["react-native","async-storage","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","react-native-mmkv"]
---

# React Native MMKV

React Native MMKV expone almacenamiento nativo clave-valor. Revisa requisitos de la versión, elige serialización y evita trabajo pesado durante interacción. Configura cifrado y claves aparte si se requieren; no es automáticamente un almacén de credenciales.

Notas relacionadas: [[react-native]], [[async-storage]], [[sqlite]].

[Referencia oficial](https://github.com/margelo/react-native-mmkv).
