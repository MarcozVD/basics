---
type: practice
title: Strict TypeScript
applies_to: [typescript]
---
- `"strict": true` in tsconfig; implicit `any` is forbidden.
- Validate external data at the boundary with `zod`, derive types with `z.infer`.
- Prefer discriminated unions over boolean flags.
