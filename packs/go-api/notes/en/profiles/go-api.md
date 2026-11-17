---
type: "profile"
title: "Go HTTP API"
description: "Go HTTP endpoints with SQL persistence"
use_when: ["Go HTTP API with JSON endpoints","Golang PostgreSQL API","Go REST APIs with input validation and bounded concurrency"]
stack: {"backend":["go","net-http","slog"],"data":["pgx","postgresql"],"testing":["go-test","httptest"]}
---

A starting choice, not a requirement: [[net-http]] with [[pgx]] and [[postgresql]]. Compare the alternative routers, frameworks and persistence tools before exporting.
