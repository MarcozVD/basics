# Basics

[English](README.md) | Español

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
<!-- badge de npm, activar cuando el paquete esté publicado:
[![npm](https://img.shields.io/npm/v/@marcozvd/basics.svg)](https://www.npmjs.com/package/@marcozvd/basics)
-->

Basics es un vault personal de tu stack tecnológico: una carpeta de notas Markdown sobre las capas, tecnologías,
prácticas, checks y perfiles que usas, que tus agentes de código leen y amplían vía MCP. Las notas son archivos
normales (frontmatter + `[[wikilinks]]`, compatibles con Obsidian y con git), y todo lo que escribe un agente llega al
inbox para que lo apruebes.

> **Estado: 1.0** — consulta el [contrato de estabilidad](https://marcozvd.github.io/basics/guide/stability.html).

## Inicio rápido

```bash
# crea un vault con los packs oficiales
npx @marcozvd/basics init ~/basics-vault --yes

# abre la interfaz web local (también sirve MCP por HTTP)
npx @marcozvd/basics --vault ~/basics-vault ui
```

Con la UI en marcha, conecta Claude Code:

```bash
claude mcp add --transport http basics http://127.0.0.1:4747/mcp
```

Pídele a tu agente que recomiende un stack y revisa en el Inbox lo que proponga.
El resto de clientes (Cursor, VS Code, Codex, OpenCode, Windsurf) están en
[Clientes MCP](https://marcozvd.github.io/basics/guide/mcp-clients.html).

## Qué hace

- **Un vault que puedes leer** — capas, tecnologías, prácticas, checks, perfiles y proyectos como notas Markdown. Sin base de datos ni formatos propietarios.
- **Agentes que preguntan antes** — lo que escribe un agente se convierte en una propuesta en `inbox/` con motivo y diff; la apruebas desde la CLI o la UI.
- **Stacks recomendados** — ordena tecnologías por capa a partir de la descripción de un proyecto, por keywords o con embeddings locales opcionales.
- **Del stack al proyecto** — exporta `STACK.md`, `AGENTS.md`, `CLAUDE.md` y reglas de Cursor, y ejecuta los checks del stack en el proyecto.
- **Packs** — packs iniciales oficiales en inglés y español, además de packs comunitarios de cualquier repositorio de GitHub; las notas y actualizaciones nuevas llegan como propuestas al inbox, nunca como escrituras silenciosas.
- **UI web local y MCP** — interfaz React con editor, grafo, diff del inbox y banco de pruebas de recomendación, y MCP por HTTP o stdio.
- **Aplicación de escritorio** — la misma UI y servidor MCP en una ventana independiente residente en la bandeja, con su propio runtime de Node incluido; no hace falta npm. Ver [Aplicación de escritorio](https://marcozvd.github.io/basics/guide/desktop.html).
- **Skill para agentes** — un `SKILL.md` que enseña a Claude Code, OpenCode o Codex cuándo usar cada herramienta de Basics. Ver [Skill para agentes](https://marcozvd.github.io/basics/guide/agent-skill.html).

_Capturas (UI web, diff del Inbox, grafo): próximamente._

## Documentación

Documentación completa: **[marcozvd.github.io/basics](https://marcozvd.github.io/basics/)**

- **Empezar** — [Primeros pasos](https://marcozvd.github.io/basics/guide/getting-started.html) · [Conceptos](https://marcozvd.github.io/basics/guide/concepts.html)
- **Uso** — [Notas](https://marcozvd.github.io/basics/guide/notes.html) · [Packs](https://marcozvd.github.io/basics/guide/packs.html) · [Clientes MCP](https://marcozvd.github.io/basics/guide/mcp-clients.html) · [UI web](https://marcozvd.github.io/basics/guide/web-ui.html) · [Recomendación](https://marcozvd.github.io/basics/guide/recommend.html) · [Proyectos y checks](https://marcozvd.github.io/basics/guide/projects-and-checks.html)
- **Operación** — [Seguridad](https://marcozvd.github.io/basics/guide/security.html) · [Problemas](https://marcozvd.github.io/basics/guide/troubleshooting.html) · [Estabilidad](https://marcozvd.github.io/basics/guide/stability.html)
- **Referencia** — [CLI](https://marcozvd.github.io/basics/reference/cli.html) · [Herramientas MCP](https://marcozvd.github.io/basics/reference/mcp-tools.html) · [Esquema del vault](https://marcozvd.github.io/basics/reference/schema.html)

Contribuciones: [CONTRIBUTING.md](CONTRIBUTING.md). Seguridad: [SECURITY.md](SECURITY.md).

## Licencia

MIT — consulta [LICENSE](LICENSE).
