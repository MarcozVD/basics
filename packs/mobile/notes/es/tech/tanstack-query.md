---
type: "tech"
kind: "library"
title: "TanStack Query"
layer: "data"
language: "typescript"
use_when: ["Caché e invalidación de estado remoto React Native","Peticiones cliente móviles con políticas de reintento y refetch"]
avoid_when: ["Se exige una base relacional local duradera","Solo se necesita estado UI local de componente"]
performs_best: ["Ciclo de estado remoto e invalidación de caché"]
related: ["react-native","async-storage","react-native-mmkv"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","tanstack-query"]
---

# TanStack Query

TanStack Query gestiona caché de estado remoto y ciclos de peticiones. En React Native conecta señales de foco y conectividad. Persistencia, colas offline y resolución de conflictos requieren políticas explícitas; una caché en memoria no es una base offline.

Notas relacionadas: [[react-native]], [[async-storage]], [[react-native-mmkv]].

[Referencia oficial](https://tanstack.com/query/latest/docs/framework/react/react-native).
