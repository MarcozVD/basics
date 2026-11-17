---
type: "tech"
kind: "library"
title: "AsyncStorage"
layer: "data"
language: "typescript"
use_when: ["Preferencias móviles React Native con API asíncrona clave-valor","Ajustes cliente pequeños sin secretos entre ejecuciones"]
avoid_when: ["Deben guardarse contraseñas o claves de firma","Se necesitan consultas relacionales y transacciones"]
performs_best: ["Preferencias cliente persistentes asíncronas"]
related: ["react-native","react-native-mmkv","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["typescript-typecheck","mobile-eslint","mobile-jest"]
tags: ["mobile","async-storage"]
---

# AsyncStorage

AsyncStorage aporta almacenamiento persistente asíncrono clave-valor para React Native. Serializa, maneja errores y prueba migración de claves. Trátalo como almacenamiento sin cifrar; usa medios seguros de plataforma para credenciales.

Notas relacionadas: [[react-native]], [[react-native-mmkv]], [[sqlite]].

[Referencia oficial](https://github.com/react-native-async-storage/async-storage).
