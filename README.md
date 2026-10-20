# Basics

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)

Vault personal de tu stack tecnológico (estilo Obsidian: Markdown + frontmatter + `[[wikilinks]]`)
que tus agentes de código consultan y amplían vía MCP.

> **Estado: experimental (0.0.x).** API, schema y CLI pueden cambiar sin aviso.

## Estructura del repo

Monorepo con npm/pnpm workspaces:

```
packages/core/     @marcozvd/basics-core: schema, vault y query (librería + tests)
packages/basics/   @marcozvd/basics: CLI (cli.ts) y servidor MCP (mcp/server.ts)
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
npm test                            # Vitest (una vez); npm run test:watch en watch mode
npm run typecheck                   # chequeo de tipos sin emitir
npm run lint                        # Biome: lint (npm run format para aplicar fixes)
```

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
basics init-project ../mi-app -s fastapi,postgresql,pytest
basics ui                            # servidor local: API REST + UI web (http://127.0.0.1:4747)
```

Desde el repo sin instalar: `npm run cli -- --vault examples/vault <comando>` o `pnpm cli ...`.

`init-project` escribe `STACK.md` (prácticas + checks del stack elegido) y añade un puntero en `AGENTS.md`.

## Conectar agentes (MCP)

Claude Code:

```bash
claude mcp add basics --scope user -- node /ruta/a/basics/packages/basics/dist/mcp/server.js /ruta/a/tu-vault
```

Con `basics ui` corriendo, también por HTTP (stateless streamable HTTP en el mismo proceso local):

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Otros clientes MCP (Cursor, etc.): comando `node packages/basics/dist/mcp/server.js [ruta-vault]` por stdio (si se omite, se resuelve con la config global).

| Tool | Uso |
|---|---|
| `list_layers` | capas y tecnologías |
| `search_vault` | búsqueda full-text |
| `get_note` | nota + backlinks + `hash` (para detectar conflictos al escribir) |
| `recommend_stack` | shortlist por capa a partir de una descripción del proyecto |
| `get_stack_context` | prácticas + checks del stack elegido, en markdown |
| `propose_note` | agente propone nota nueva o cambio, va a `inbox/` |
| `list_proposals` | propuestas pendientes |

Los agentes nunca escriben directo en el vault: todo pasa por `inbox/` hasta que lo apruebas.

## Releases

Los cambios se describen con [changesets](https://github.com/changesets/changesets): `npx changeset` al hacer un cambio relevante; `npm run version-packages` hace el bump de versión de los paquetes. El publicado en npm es manual (requiere 2FA del owner).

## Roadmap

- [ ] UI web local (Vite + React): editor, formularios por capa, vista grafo, revisión de inbox con diff
- [ ] Índice SQLite FTS cuando el vault crezca
- [ ] Recomendación semántica (embeddings) además de keywords
- [ ] Runner de checks: ejecutar `command` de cada check en el proyecto y reportar
