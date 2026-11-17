---
type: "profile"
title: "API HTTP Go"
description: "Endpoints HTTP Go con persistencia SQL"
use_when: ["API HTTP Go con endpoints JSON","API Golang PostgreSQL","APIs REST Go con validación de entrada y concurrencia acotada"]
stack: {"backend":["go","net-http","slog"],"data":["pgx","postgresql"],"testing":["go-test","httptest"]}
---

Una opción inicial, no una obligación: [[net-http]] con [[pgx]] y [[postgresql]]. Compara routers, frameworks y herramientas de persistencia antes de exportar.
