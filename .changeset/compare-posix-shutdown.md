---
"@marcozvd/basics": patch
"@marcozvd/basics-core": patch
---

Confirm stopped process groups correctly on macOS when only zombie entries remain, while keeping acceptance tests unstaged if live processes remain or their state cannot be verified. Include process IDs and states when shutdown is unconfirmed.
