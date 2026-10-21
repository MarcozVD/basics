---
type: check
title: Typecheck TypeScript
kind: build
applies_to: [typescript]
command: npx tsc --noEmit
---
Cero errores de tipo. No silenciar con `@ts-ignore` sin comentario justificando.

Usa esta configuración más estricta sobre el `tsconfig.json` del proyecto:

```json file=tsconfig.strict.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "noFallthroughCasesInSwitch": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "forceConsistentCasingInFileNames": true
  }
}
```
