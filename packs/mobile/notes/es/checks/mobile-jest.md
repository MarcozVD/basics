---
type: "check"
title: "Pruebas de módulos y componentes nativos"
kind: "test"
command: "npx --no-install jest --runInBand"
applies_to: ["react-native","expo","react-native-mmkv","async-storage","tanstack-query","jest","react-native-testing-library","detox"]
---

Requiere preset, transforms y pruebas Jest del proyecto. Cubre rechazo y comportamiento visible. Módulos nativos simulados requieren dispositivos aparte; una suite vacía no es cobertura.
