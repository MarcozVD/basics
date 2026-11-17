---
type: "tech"
kind: "tool"
title: "sqlc"
layer: "data"
language: "go"
use_when: ["Go typed query code generated from SQL","Go project keeping SQL queries as the source of truth"]
avoid_when: ["The team cannot maintain a code-generation step","Runtime entity mapping is preferred"]
performs_best: ["Generated Go query methods and parameter types"]
related: ["go","database-sql","pgx","postgresql","sqlite"]
practices: ["go-layout","go-context","go-errors"]
checks: ["go-vet","go-lint","go-tests-race"]
tags: ["go","sqlc"]
---

# sqlc

sqlc generates Go code from SQL queries and schema inputs. Keep generation reproducible, select the supported engine and driver deliberately, and review generated changes. Generation does not apply migrations or prove query behavior against production data.

Related notes: [[go]], [[database-sql]], [[pgx]], [[postgresql]], [[sqlite]].

[Official reference](https://docs.sqlc.dev/).
