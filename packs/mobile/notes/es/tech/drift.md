---
type: "tech"
kind: "library"
title: "Drift"
layer: "data"
language: "dart"
use_when: ["Persistencia móvil Flutter con consultas SQLite tipadas","Almacenamiento relacional cliente Dart con migraciones"]
avoid_when: ["Se debe elegir un servidor de base de datos remoto","Solo deben guardarse unas pocas preferencias","Se necesita sincronización de registros compartidos entre clientes en un servidor"]
performs_best: ["Consultas cliente relacionales tipadas y streams de cambios"]
related: ["flutter","sqlite","hive-ce"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","drift"]
---

# Drift

Drift añade persistencia Dart sobre SQLite con consultas tipadas y migraciones. Elige executor por plataforma, prueba cambios de esquema y transacciones y diseña sincronización aparte. Una base local no resuelve conflictos remotos por sí sola.

Notas relacionadas: [[flutter]], [[sqlite]], [[hive-ce]].

[Referencia oficial](https://drift.simonbinder.eu/).
