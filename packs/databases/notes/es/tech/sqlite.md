---
type: "tech"
kind: "database"
title: "SQLite"
layer: "data"
use_when: ["Almacenamiento SQL integrado en una aplicación","Archivos locales sin un servidor separado"]
avoid_when: ["Muchas máquinas necesitan acceso directo a la base","Escrituras concurrentes sostenidas requieren un servidor"]
performs_best: ["Almacenamiento relacional integrado","Despliegue sencillo con persistencia local"]
related: ["postgresql"]
practices: ["sql-migrations"]
checks: []
tags: ["sqlite","embedded","local-storage"]
---

# SQLite

SQLite se ejecuta dentro de la aplicación, no como servidor separado. Revisa concurrencia de escritura y copias de seguridad. Considera una base cliente/servidor como [[postgresql]] si prima el acceso remoto compartido.

Notas relacionadas: [[postgresql]].

Referencia oficial: [SQLite](https://www.sqlite.org/whentouse.html).
