---
type: check
title: TypeScript typecheck
kind: build
applies_to: [typescript]
command: npx tsc --noEmit
---
Zero type errors. Do not silence with `@ts-ignore` without a comment justifying it.

Use this stricter config on top of the project's `tsconfig.json`:

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
