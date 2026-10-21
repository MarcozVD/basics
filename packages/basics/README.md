# Basics

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)

Vault personal de tu stack tecnológico (estilo Obsidian: Markdown + frontmatter + `[[wikilinks]]`)
que tus agentes de código consultan y amplían vía MCP.

> **Estado: experimental (0.x).** API, schema y CLI pueden cambiar sin aviso.

Repositorio: [github.com/MarcozVD/basics](https://github.com/MarcozVD/basics).

## Estructura del vault

```
layers/     capas: backend, frontend, testing, data, infra
tech/       lenguajes, frameworks, librerías (use_when, avoid_when, performs_best, practices, checks)
practices/  buenas prácticas (applies_to: [tech])
checks/     validaciones que el código generado debe pasar (kind, command)
profiles/   combinaciones de stack para tipos de proyecto
projects/   proyectos (description, path, status active|paused|archived, profile, stack, reason, lessons, last_checks)
inbox/      propuestas de agentes pendientes de aprobación
```

El vault es una carpeta normal: se puede abrir también con Obsidian y versionar con git.
Hay un vault de ejemplo en [`examples/vault`](https://github.com/MarcozVD/basics/tree/main/examples/vault).

Schema v2: `tech` admite `version` y `packages` (npm/pypi) para reconocer la tecnología en los manifiestos de un proyecto;
`practices` y `checks` admiten `since`/`until` (rango de versiones: se filtran por la versión detectada);
`projects` admite `last_checks` (resultado del último `basics check`);
los campos de frontmatter desconocidos se conservan al leer y reescribir notas.

## Instalación

Paquete npm: [`@marcozvd/basics`](https://www.npmjs.com/package/@marcozvd/basics). Funciona con npm o pnpm. Requiere Node.js >= 20.11.

```bash
npm install -g @marcozvd/basics     # o: pnpm add -g @marcozvd/basics
basics --help
```

## Primeros pasos

```bash
basics init                       # interactivo: carpeta del vault, idioma y packs
basics init ~/mi-vault --yes      # sin preguntas: instala todos los packs
```

`basics init` crea la carpeta del vault (una por tipo de nota más `inbox/`), pregunta el idioma y qué packs instalar,
y guarda `vault` y `language` en la config global. Flags: `--lang en|es`, `--packs a,b` (o `--packs none`) y `--yes`.
Sin terminal interactiva se comporta como `--yes`.

Packs oficiales incluidos:

| Pack | Contenido | Requiere |
| --- | --- | --- |
| `core-layers` | las 5 capas base (frontend, backend, data, infra, testing) | — |
| `web-typescript` | TypeScript, React, Next.js, Vitest, Playwright + prácticas y checks | `core-layers` |
| `python-api` | Python, FastAPI, pytest, PostgreSQL + prácticas y checks | `core-layers` |
| `profiles` | perfiles `ml-api` y `saas-web` | `web-typescript`, `python-api` |

Cada pack viene en inglés y en español (`notes/en` y `notes/es`) con los mismos ids de nota.

## Packs

```bash
basics pack list                              # packs, versión, versión instalada y nº de notas
basics pack install core-layers python-api    # instala con sus dependencias
basics pack install web-typescript --lang es  # notas en español
basics pack update                            # propone actualizaciones en el inbox
```

`basics pack update` nunca escribe en el vault: crea propuestas en `inbox/` (`proposed_by: pack:<nombre>@<versión>`)
con las notas nuevas o modificadas del pack; las notas que el pack ya no incluye se ignoran. Se aprueban como
cualquier propuesta de agente:

```bash
basics inbox list
basics inbox approve-all --from pack:python-api   # aprueba todas las propuestas de ese pack
```

## Interfaz web

```bash
basics ui                            # sirve y abre http://127.0.0.1:4747
basics ui --port 5000                # otro puerto
basics ui --no-open                  # sin abrir el navegador
```

Pantallas:

- **Explorar**: filtros por capa y tipo con conteos, búsqueda, navegación por teclado y diálogo para crear notas.
- **Editor**: formulario de frontmatter generado por cada tipo de nota, cuerpo markdown, panel de links/backlinks; guarda con `Ctrl+S`;
  si la nota cambió en disco aparece un banner de conflicto (Recargar / Sobrescribir).
- **Inbox**: propuestas con diff lado a lado o unificado; Aprobar, Editar y aprobar o Rechazar con los atajos `a` / `e` / `r`;
  las propuestas de un pack se agrupan con una barra "Approve all" para aprobarlas de golpe.
- **Recomendar**: descripción del proyecto y capas → perfiles y candidatos por capa (`use_when`, `performs_best`, `avoid_when`),
  selección de candidatos y modal de export con pestañas **STACK.md | AGENTS.md | CLAUDE.md | Cursor**.
  Muestra el modo de recomendación (**Keywords** o **Hybrid**, según los [embeddings locales](#búsqueda-semántica-local-opcional)) y el desglose de cada score.

Con el vault vacío, **Home** muestra el onboarding de packs iniciales ("Start with a starter pack"): elegirlos e instalarlos sin salir de la pantalla.

La UI se actualiza en vivo cuando cambian los archivos del vault (SSE) y trae selector de idioma EN/ES y tema claro/oscuro.

MCP sobre HTTP mientras corre `basics ui` (stateless streamable HTTP en `http://127.0.0.1:4747/mcp`):

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Seguridad: el servidor solo escucha en `127.0.0.1` y rechaza peticiones con `Host`/`Origin` que no sean de localhost.

## Configuración

Config global en `~/.config/basics/config.json` (ruta alternativa con `BASICS_CONFIG`). Claves: `vault`, `language` (`en`|`es`), `embeddings` (`true`|`false`), `embeddingsModel` (modelo de embeddings, ver *Búsqueda semántica local*).

```bash
basics config path                    # ruta del archivo de config
basics config get                     # config actual + vault resuelto
basics config set vault ~/mi-vault    # vault (guardado como ruta absoluta)
basics config set language es
basics config set embeddings true
```

El vault se resuelve en este orden de prioridad: flag `--vault` > variable `BASICS_DIR` > `vault` en config > `~/basics-vault` (por defecto).
Si no existe, la CLI avisa con `Vault not found` (sin stack trace) y las tools MCP devuelven el error en vez de fallar.

## Uso

```bash
basics list
basics validate                     # esquemas, ids duplicados, links rotos
basics new tech django -l backend
basics recommend "API REST para servir modelos de ML"
basics inbox                        # propuestas de agentes
basics inbox approve django
basics export ../mi-app --stack fastapi,postgresql,pytest
basics detect ../mi-app             # tecnologías y versiones del proyecto
basics check ../mi-app              # ejecuta los checks del stack en el proyecto
basics ui                            # servidor local: API REST + UI web (http://127.0.0.1:4747)
```

## Detectar el stack

```bash
basics detect                       # en el directorio actual
basics detect ../mi-app --json      # resultado completo en JSON
```

`basics detect [dir]` lee, sin recursión, `package.json` (dependencies y devDependencies), `pyproject.toml`
(`[project]`, `[project.optional-dependencies]`, `[tool.poetry.*]`) y `requirements*.txt` (`requirements.txt`,
`requirements-dev.txt`), y devuelve las tecnologías del vault con la versión detectada:

```
ID          VERSION   SOURCE
next        15.3.0    package.json
fastapi     0.115.0   pyproject.toml
```

El mapeo de paquete → tecnología sale del campo `packages` de la nota tech (`packages: { npm: [...], pypi: [...] }`):
`nextjs` → npm `next`, `postgresql` → pypi `psycopg`, `psycopg2`, `psycopg2-binary`, `asyncpg` y npm `pg`, etc. En Python
los nombres se normalizan según PEP 503 (minúsculas y guiones). Los paquetes que no encajan con ninguna nota salen aparte
como "Unknown packages". La versión es la mínima del rango declarado (`semver.minVersion` en npm, `>=`/`==`/`~=` en Python)
y se deja vacía si no se puede parsear.

Por MCP hace lo mismo la tool `detect_stack` (solo lectura).

## Recomendación

```bash
basics recommend "API REST sin SEO, en TypeScript"
basics recommend "API REST para servir modelos de ML" --json   # respuesta completa en JSON
```

`basics recommend` devuelve, por capa, las techs del vault ordenadas por score. Cada línea muestra el score y su desglose:

```
backend
  fastapi                  3  kw=5 sem=— neg=0 lang=-2
      use: API REST o JSON async
```

- `kw`: puntuación por keywords (`use_when`, `performs_best`, tags frente a la descripción).
- `sem`: similitud semántica; `—` cuando no hay embeddings activos.
- `neg`: ajuste por negaciones.
- `lang`: boost por lenguaje.

Las negaciones se detectan en español e inglés ("sin SEO", "no UI", "evitar SSR", "without SSR"): la cláusula negada no suma
por sus términos positivos, y un `use_when` que coincide con ella resta puntos mientras que un `avoid_when` que coincide suma.
Si la descripción nombra un lenguaje ("en TypeScript"), las techs escritas en ese lenguaje suben y las de la misma capa escritas
en otro lenguaje bajan.

Por MCP, la tool `recommend_stack` devuelve el mismo resultado; la pantalla **Recomendar** de la UI muestra el mismo desglose.

## Búsqueda semántica local (opcional)

Además de las keywords, basics puede comparar la descripción con las notas por significado usando un modelo de embeddings
que corre en tu máquina. Está desactivado por defecto y **no se descarga nada hasta que lo actives**:

```bash
basics embeddings enable              # pide confirmación; --yes la omite
basics embeddings status              # config, runtime, caché del modelo e índice
basics embeddings reindex             # sincroniza el índice con el vault
basics embeddings reindex --full      # vuelve a embeber todas las notas
basics embeddings disable             # desactiva (conserva los ficheros descargados)
basics embeddings disable --purge     # desactiva y borra el runtime y el modelo de la caché
```

`enable` descarga unos 375 MB de runtime (`@huggingface/transformers` + `onnxruntime`) y el modelo
`Xenova/multilingual-e5-small` (unos 130 MB): unos 500 MB en total, guardados en `BASICS_CACHE` o en `~/.cache/basics`.
Sin terminal interactiva y sin `--yes`, el comando aborta.

El índice vive en `<vault>/.basics/embeddings.json` + `embeddings.bin`. Solo se reembeben las notas que cambiaron desde la
última sincronización; las notas borradas salen del índice. Cambiar de modelo reconstruye el índice entero.

Cuando los embeddings están activos, `basics recommend`, la tool MCP `recommend_stack` y la pantalla Recomendar usan el modo
**híbrido**: fusionan el score de keywords y el semántico (normalizados por capa) y el score mostrado pasa a ser el híbrido.
La UI indica el modo activo: **Keywords** o **Hybrid**. Sin embeddings, todo funciona igual que antes con keywords.

Modelo configurable con la clave `embeddingsModel` (por defecto `Xenova/multilingual-e5-small`).

## Exportar a un proyecto

```bash
basics export ../mi-app --stack fastapi,postgresql,pytest --targets agents,claude,cursor
basics export ../mi-app --detect            # detecta el stack del proyecto y lo fusiona con el guardado
basics export ../mi-app --templates         # escribe las plantillas de archivos de los checks
basics export ../mi-app --dry-run
```

Genera en el proyecto:

- `STACK.md`: prácticas y checks del stack elegido (archivo completo).
- `AGENTS.md` y `CLAUDE.md`: un bloque marcado `<!-- basics:start -->` … `<!-- basics:end -->`; el texto fuera del bloque no se toca.
- `.cursor/rules/stack.mdc`: archivo completo con `alwaysApply: true`.

El stack y los targets se guardan en `basics.json` en la raíz del proyecto, así que la siguiente vez basta con
`basics export ../mi-app`; los flags sobrescriben lo guardado. `--dry-run` muestra cada archivo y si cambiaría, sin escribir nada.

`init-project` queda como alias oculto y deprecado (equivale a `basics export --targets agents`).

Por MCP, la tool `export_project` devuelve el contenido de esos archivos (JSON) sin tocar el disco: el agente los
escribe en la raíz del proyecto.

### Stack detectado y versiones

`--detect` detecta el stack del proyecto con las mismas reglas que `basics detect`, fusiona los ids detectados con los
guardados y persiste las versiones en `basics.json`:

```json
{
  "stack": ["fastapi", "postgresql", "pytest"],
  "targets": ["agents", "claude"],
  "project": "mi-app",
  "versions": { "fastapi": "0.115.0", "postgresql": "16.4" }
}
```

Con las versiones a mano, el export (y el contexto del stack) se filtran por versión: las prácticas y los checks con
`since`/`until` (`since` inclusivo, `until` exclusivo) fuera del rango de la tecnología detectada se omiten; si la
versión se desconoce, se mantienen.

### Nota de proyecto

`basics export` crea (o actualiza) en el vault una nota de tipo `project` para esa carpeta —id = nombre de la carpeta
(con `-2`, `-3`… si ya existe otra nota con ese id), `path` absoluto, `stack` agrupado por capa y `status: active`— y
guarda su id en `basics.json` (`"project"`). Esa nota acumula las `lessons` y el resultado de los checks, y es el enlace
entre el proyecto y el vault.

## Checks del proyecto

```bash
basics check                       # en el directorio actual (lee basics.json)
basics check ../mi-app --list      # checks, comando y estado de confianza, sin ejecutar
basics check ../mi-app --only pytest,ruff
basics check ../mi-app --trust     # confía y ejecuta todo (CI)
basics check ../mi-app --strict --verbose --timeout 120
```

`basics check [dir]` ejecuta en el directorio del proyecto el `command` de cada check del stack guardado en `basics.json`.
Si el directorio no tiene `basics.json`, el comando avisa y sale con código 1: primero `basics export`.
Antes de cada comando muestra el directorio y el comando exacto y pide confirmación: `y` (ejecutar esta vez), `n` (no) o
`a` (always, guardar la confianza). La trust list vive en `<vault>/.basics/trust.json` y se indexa por
`sha256(directorio absoluto + comando)`, así que al mover el proyecto o cambiar el comando vuelve a preguntar.

| Flag | Qué hace |
| --- | --- |
| `--list` | lista checks, comando y si están confiados, sin ejecutar nada |
| `--only <ids>` | ejecuta solo los checks indicados (comma separated) |
| `--trust` | confía y ejecuta sin preguntar (para CI) |
| `--timeout <s>` | timeout por check, 600 s por defecto |
| `--verbose` | muestra la salida del comando en vivo |
| `--strict` | también falla si algún check quedó `skip` o `untrusted` |

Códigos de salida: `0` si todo pasó, `1` si algún check falló, si se canceló la confirmación o si `--strict` detecta
checks omitidos o no confiados. Sin TTY y sin `--trust`, los comandos no confiados quedan `untrusted` y no se ejecutan.

Los resultados se guardan en `last_checks` de la nota project (estado, fecha, duración y cola de salida) y en la UI se ven
como chips de estado bajo el título.

## Plantillas de tests

Un check puede traer plantillas de archivos: un bloque de código con `file=<ruta>` en el cuerpo del check.

````markdown
```python file=tests/test_health.py
def test_health():
    assert True
```
````

`basics export --templates` escribe esos archivos en el proyecto, pero solo los que **no** existen: nunca sobrescribe.
La tool MCP `get_check_templates` devuelve las plantillas del stack en JSON para que el agente las escriba.

## Conectar agentes (MCP)

Claude Code:

```bash
claude mcp add basics --scope user -- basics-mcp /ruta/a/tu-vault
```

Con `basics ui` corriendo, el mismo servidor también expone MCP por HTTP (ver *Interfaz web*).

Otros clientes MCP (Cursor, etc.): ejecuta `basics-mcp [ruta-vault]` por stdio (si se omite la ruta, se resuelve con la config global).

| Tool | Uso |
|---|---|
| `list_layers` | capas y tecnologías |
| `search_vault` | búsqueda full-text |
| `get_note` | nota + backlinks + `hash` (para detectar conflictos al escribir) |
| `recommend_stack` | shortlist por capa a partir de una descripción del proyecto (híbrido si hay embeddings) |
| `get_stack_context` | prácticas + checks del stack elegido, en markdown |
| `detect_stack` | detecta tecnologías y versiones en los manifiestos de un proyecto (solo lectura) |
| `get_check_templates` | plantillas de archivos (tests, configs) que traen los checks del stack |
| `propose_note` | agente propone nota nueva o cambio, va a `inbox/` |
| `list_proposals` | propuestas pendientes |
| `export_project` | devuelve los archivos de export (STACK.md, AGENTS.md, CLAUDE.md, Cursor) para que los escriba el agente |
| `record_project_outcome` | propone el resultado de un proyecto (lecciones, ampliaciones de tech) en el `inbox/` |

Los agentes nunca escriben directo en el vault: todo pasa por `inbox/` hasta que lo apruebas.

## Desarrollo

El código vive en el monorepo [github.com/MarcozVD/basics](https://github.com/MarcozVD/basics): `packages/basics` (esta CLI + servidor),
`packages/core` ([`@marcozvd/basics-core`](https://www.npmjs.com/package/@marcozvd/basics-core)) y `packages/ui` (UI web).

Evaluación de la recomendación (desde el repo, sobre los packs oficiales):

```bash
npm run eval                        # keywords: hit@1, hit@3 y violaciones de forbid
npm run eval -- --hybrid            # score híbrido (requiere `basics embeddings enable`)
npm run eval -- --hybrid --grid     # barrido de pesos (w, θ, μ) del score híbrido
npm run eval -- --json              # resultado crudo en JSON
```

## Roadmap

- [ ] Vista grafo en la UI
- [ ] Índice SQLite FTS cuando el vault crezca
- [x] Recomendación semántica (embeddings) además de keywords
- [x] Runner de checks: ejecutar `command` de cada check en el proyecto y reportar
