# Basics

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)

Vault personal de tu stack tecnológico (estilo Obsidian: Markdown + frontmatter + `[[wikilinks]]`)
que tus agentes de código consultan y amplían vía MCP.

> **Estado: experimental (0.x).** API, schema y CLI pueden cambiar sin aviso.

## Estructura del repo

Monorepo con npm/pnpm workspaces:

```
packages/core/     @marcozvd/basics-core: schema, vault y query (librería + tests)
packages/basics/   @marcozvd/basics: CLI (cli.ts), servidor HTTP/MCP (server/, mcp/)
packages/ui/       @marcozvd/basics-ui: UI web (React + Vite; se sirve desde basics ui)
packs/             packs oficiales de notas (core-layers, web-typescript, python-api, profiles)
examples/vault/    vault semilla de ejemplo
```

## Estructura del vault

```
examples/vault/
  layers/     capas: backend, frontend, testing, data, infra
  tech/       lenguajes, frameworks, librerías (use_when, avoid_when, performs_best, practices, checks)
  practices/  buenas prácticas (applies_to: [tech])
  checks/     validaciones que el código generado debe pasar (kind, command)
  profiles/   combinaciones de stack para tipos de proyecto
  projects/   proyectos (description, path, status active|paused|archived, profile, stack, reason, lessons)
  inbox/      propuestas de agentes pendientes de aprobación
```

El vault es una carpeta normal: se puede abrir también con Obsidian y versionar con git.

Schema v2: `tech` admite `version`; `practices` y `checks` admiten `since`/`until` (rango de versiones, el filtrado llega en M4);
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
y guarda `vault` y `language` en la config global. Flags: `--lang en|es`, `--packs a,b` (o `--packs none`) y `--yes`
(acepta los valores por defecto e instala todos los packs). Sin terminal interactiva se comporta como `--yes`.

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
con las notas nuevas o modificadas del pack; las notas que el pack ya no incluye se ignoran. Se revisan y aprueban
como cualquier propuesta de agente:

```bash
basics inbox list
basics inbox approve-all --from pack:python-api   # aprueba todas las propuestas de ese pack
```

En la UI, el Inbox agrupa las propuestas de un pack y ofrece "Approve all" por pack.

## Interfaz web

```bash
basics ui                            # sirve y abre http://127.0.0.1:4747
basics ui --port 5000                # otro puerto
basics ui --no-open                  # sin abrir el navegador
```

Pantallas:

- **Home**: la sala de control del ciclo con agentes — propuestas pendientes aprobables inline, timeline de actividad de los agentes, salud y forma del vault (notas por tipo, links rotos, huérfanas, recientes). Con el vault vacío muestra el onboarding de packs iniciales ("Start with a starter pack"): elegirlos e instalarlos sin salir de la pantalla.
- **Explorar**: filtros por capa y tipo con conteos, búsqueda, vista lista o grid, navegación por teclado y diálogo para crear notas.
- **Editor**: formulario de frontmatter generado por cada tipo de nota, cuerpo markdown (editar / vista previa / dividido) con
  autocompletado de `[[wikilinks]]`, conexiones (links, backlinks, sin resolver) y grafo local; guarda con `Ctrl+S`;
  si la nota cambió en disco aparece un banner de conflicto (Recargar / Sobrescribir).
- **Grafo**: todas las notas y sus links, filtros por tipo y capa en una barra flotante, búsqueda de nodos, links rotos y foco en el vecindario de un nodo.
- **Inbox**: propuestas con diff lado a lado o unificado; Aprobar, Editar y aprobar o Rechazar con los atajos `a` / `e` / `r`.
- **Recomendar**: descripción del proyecto y capas → perfiles y candidatos por capa (`use_when`, `performs_best`, `avoid_when`),
  selección de candidatos y modal de export con pestañas **STACK.md | AGENTS.md | CLAUDE.md | Cursor**, cada una con copiar o descargar.

La UI se actualiza en vivo cuando cambian los archivos del vault (SSE) y trae selector de idioma EN/ES y tema claro/oscuro.

Navegación: dock flotante en la parte inferior (Home, Explore, Graph, Inbox, Recommend); sin barras laterales, los paneles secundarios son overlays que se cierran con `Esc`.

Atajos de teclado:

| Atajo | Acción |
| --- | --- |
| `Ctrl`/`⌘+K` | Paleta de comandos: busca notas y propuestas, salta a cualquier pantalla y ejecuta acciones (incluido copiar el comando MCP) |
| `g` y luego `h` / `e` / `g` / `i` / `r` | Ir a Home / Explore / Graph / Inbox / Recommend |
| `Ctrl`/`⌘+S` | Guardar la nota en el editor |
| `Ctrl`/`⌘+F` | Enfocar la búsqueda en Explore y en el grafo |
| `↑` / `↓`, `Enter` | Moverse por listas (Explore, Inbox, paleta) y abrir |
| `a` / `r` | Aprobar / Rechazar la propuesta seleccionada en el Inbox |
| `a` / `e` / `r` | Aprobar / Editar y aprobar / Rechazar en el detalle de una propuesta |
| `Ctrl`/`⌘+Enter` | Ejecutar la recomendación |

El sistema de diseño de la UI (tokens, layout, motion, componentes) está en [packages/ui/DESIGN.md](packages/ui/DESIGN.md).

MCP sobre HTTP mientras corre `basics ui` (stateless streamable HTTP en `http://127.0.0.1:4747/mcp`):

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Seguridad: el servidor solo escucha en `127.0.0.1` y rechaza peticiones con `Host`/`Origin` que no sean de localhost.

En desarrollo: `basics ui --no-open` (API local) junto a `npm run dev:ui` (Vite con proxy); E2E con `npm run e2e` (requiere build antes).

## Configuración

Config global en `~/.config/basics/config.json` (ruta alternativa con `BASICS_CONFIG`). Claves: `vault`, `language` (`en`|`es`), `embeddings` (`true`|`false`).

```bash
basics config path                    # ruta del archivo de config
basics config get                     # config actual + vault resuelto
basics config set vault ~/mi-vault    # vault (guardado como ruta absoluta)
basics config set language es
basics config set embeddings true
```

El vault se resuelve en este orden de prioridad: flag `--vault` > variable `BASICS_DIR` > `vault` en config > `~/basics-vault` (por defecto).
Si no existe, la CLI avisa con `Vault not found` (sin stack trace) y las tools MCP devuelven el error en vez de fallar.

## Desarrollo

```bash
npm install && npm run build        # o: pnpm install && pnpm build
npm run e2e                         # Playwright E2E (requiere npm run build antes)
npm test                            # Vitest (una vez); npm run test:watch en watch mode
npm run typecheck                   # chequeo de tipos sin emitir
npm run lint                        # Biome: lint (npm run format para aplicar fixes)
npm run dev:ui                      # Vite en desarrollo, proxy hacia la API de `basics ui`
```

`npm run build` compila core, basics y la UI, y la copia a `packages/basics/dist/ui` (la sirve `basics ui`).

El repo usa Biome para lint/format (2 espacios, línea máx. 140) y fuerza fin de línea LF con `.gitattributes`.

Desde el repo, contra el vault de ejemplo:

```bash
npm run cli -- --vault examples/vault list
npm run dev:mcp -- examples/vault    # servidor MCP en desarrollo
```

## Uso

```bash
basics list
basics validate                     # esquemas, ids duplicados, links rotos
basics new tech django -l backend
basics recommend "API REST para servir modelos de ML"
basics inbox                        # propuestas de agentes
basics inbox approve django
basics export ../mi-app --stack fastapi,postgresql,pytest
basics ui                            # servidor local: API REST + UI web (http://127.0.0.1:4747)
```

Desde el repo sin instalar: `npm run cli -- --vault examples/vault <comando>` o `pnpm cli ...`.

## Exportar a un proyecto

```bash
basics export ../mi-app --stack fastapi,postgresql,pytest --targets agents,claude,cursor
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

## Conectar agentes (MCP)

Claude Code:

```bash
claude mcp add basics --scope user -- node /ruta/a/basics/packages/basics/dist/mcp/server.js /ruta/a/tu-vault
```

Con `basics ui` corriendo, el mismo servidor también expone MCP por HTTP (ver *Interfaz web*).

Otros clientes MCP (Cursor, etc.): comando `node packages/basics/dist/mcp/server.js [ruta-vault]` por stdio (si se omite, se resuelve con la config global).

El MCP por HTTP (`/mcp`) usa sesiones (`mcp-session-id`) para identificar al agente que llama; las sesiones inactivas se descartan solas.

Actividad: cada llamada MCP correcta se registra en `<vault>/.basics/activity.jsonl` (agente, tool, notas afectadas), con tope ~1000 líneas.
Es un log local, la carpeta `.basics/` se añade al `.gitignore` del vault automáticamente, y la UI lo lee por `GET /api/activity` y eventos SSE `activity`.

| Tool | Uso |
|---|---|
| `list_layers` | capas y tecnologías |
| `search_vault` | búsqueda full-text |
| `get_note` | nota + backlinks + `hash` (para detectar conflictos al escribir) |
| `recommend_stack` | shortlist por capa a partir de una descripción del proyecto |
| `get_stack_context` | prácticas + checks del stack elegido, en markdown |
| `propose_note` | agente propone nota nueva o cambio, va a `inbox/` |
| `list_proposals` | propuestas pendientes |
| `export_project` | devuelve los archivos de export (STACK.md, AGENTS.md, CLAUDE.md, Cursor) para que los escriba el agente |

Los agentes nunca escriben directo en el vault: todo pasa por `inbox/` hasta que lo apruebas.

## Releases

Los cambios se describen con [changesets](https://github.com/changesets/changesets): `npx changeset` al hacer un cambio relevante; `npm run version-packages` hace el bump de versión de los paquetes. El publicado en npm es manual (requiere 2FA del owner).

## Roadmap

- [ ] UI web local (Vite + React): editor, formularios por capa, vista grafo, revisión de inbox con diff
- [ ] Índice SQLite FTS cuando el vault crezca
- [ ] Recomendación semántica (embeddings) además de keywords
- [ ] Runner de checks: ejecutar `command` de cada check en el proyecto y reportar

## Créditos

Componentes de motion y UI adaptados de [beUI](https://beui.dev) (MIT, © 2026 Saurabh Chauhan). Detalle en [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
