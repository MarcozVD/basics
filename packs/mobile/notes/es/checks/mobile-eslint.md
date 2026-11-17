---
type: "check"
title: "Lint TypeScript nativo"
kind: "lint"
command: "npx --no-install eslint ."
applies_to: ["react-native","expo","react-native-mmkv","async-storage","tanstack-query","jest","react-native-testing-library","detox"]
---

Usa ESLint local y la configuración React Native del proyecto. Configura parsing TypeScript y globals nativos. El comando no instala dependencias ni valida binarios nativos.
