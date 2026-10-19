# Basics

Vault personal de tu stack tecnológico (estilo Obsidian: Markdown + frontmatter + `[[wikilinks]]`)
que tus agentes de código consultan y amplían vía MCP.

> **Estado: experimental (0.0.x).** API, schema y CLI pueden cambiar sin aviso.

## Estructura del vault

```
vault/
  layers/     capas: backend, frontend, testing, data, infra
  tech/       lenguajes, frameworks, librerías (use_when, avoid_when, performs_best, practices, checks)
  practices/  buenas prácticas (applies_to: [tech])
  checks/     validaciones que el código generado debe pasar (kind, command)
  profiles/   combinaciones de stack para tipos de proyecto
  inbox/      propuestas de agentes pendientes de aprobación
```

El vault es una carpeta normal: se puede abrir también con Obsidian y versionar con git.

## Instalación

Paquete npm: [`@marcozvd/basics`](https://www.npmjs.com/package/@marcozvd/basics). Funciona con npm o pnpm.

```bash
npm install -g @marcozvd/basics     # o: pnpm add -g @marcozvd/basics
basics --help
```

## Desarrollo

```bash
npm install && npm run build        # o: pnpm install && pnpm build
npm test                            # o: pnpm test
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
```

Desde el repo sin instalar: `npm run cli -- <comando>` o `pnpm cli <comando>`.

`init-project` escribe `STACK.md` (prácticas + checks del stack elegido) y añade un puntero en `AGENTS.md`.

## Conectar agentes (MCP)

Claude Code:

```bash
claude mcp add basics --scope user -- node /ruta/a/basics/dist/mcp/server.js /ruta/a/tu-vault
```

Otros clientes MCP (Cursor, etc.): comando `node dist/mcp/server.js <ruta-vault>` por stdio.

| Tool | Uso |
|---|---|
| `list_layers` | capas y tecnologías |
| `search_vault` | búsqueda full-text |
| `get_note` | nota + backlinks |
| `recommend_stack` | shortlist por capa a partir de una descripción del proyecto |
| `get_stack_context` | prácticas + checks del stack elegido, en markdown |
| `propose_note` | agente propone nota nueva o cambio, va a `inbox/` |
| `list_proposals` | propuestas pendientes |

Los agentes nunca escriben directo en el vault: todo pasa por `inbox/` hasta que lo apruebas.

## Roadmap

- [ ] UI web local (Vite + React): editor, formularios por capa, vista grafo, revisión de inbox con diff
- [ ] Índice SQLite FTS cuando el vault crezca
- [ ] Recomendación semántica (embeddings) además de keywords
- [ ] Runner de checks: ejecutar `command` de cada check en el proyecto y reportar
