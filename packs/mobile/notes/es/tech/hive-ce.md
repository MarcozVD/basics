---
type: "tech"
kind: "library"
title: "Hive CE"
layer: "data"
language: "dart"
use_when: ["Persistencia cliente Flutter organizada en cajas clave-valor","Modelos móviles Dart sin joins relacionales"]
avoid_when: ["Son centrales restricciones relacionales y joins SQL","Se necesita un motor de base de datos remoto"]
performs_best: ["Persistencia local Dart orientada a cajas"]
related: ["flutter","drift","sqlite"]
practices: ["mobile-offline","mobile-state-navigation","mobile-signing","mobile-accessibility"]
checks: ["flutter-analyze","flutter-unit","flutter-device"]
tags: ["mobile","hive-ce"]
---

# Hive CE

Hive CE aporta persistencia clave-valor Dart. Revisa adaptadores y evolución de esquema, aísla cajas de prueba y verifica archivos/plataformas. No es una base relacional ni una política de secretos.

Notas relacionadas: [[flutter]], [[drift]], [[sqlite]].

[Referencia oficial](https://pub.dev/packages/hive_ce).
