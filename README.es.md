# Basics

[English](README.md) | Español

[![CI](https://github.com/MarcozVD/basics/actions/workflows/ci.yml/badge.svg)](https://github.com/MarcozVD/basics/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![npm](https://img.shields.io/npm/v/@marcozvd/basics.svg)](https://www.npmjs.com/package/@marcozvd/basics)

Tu [agente](https://marcozvd.github.io/basics/guide/glossary.html#agent) de código (la herramienta de IA que escribe código por ti)
no sabe cómo construyes las cosas, así que adivina. Cada proyecto nuevo empieza de cero: el agente vuelve a elegir framework, base de
datos y herramienta de pruebas, y lo que decidiste en el proyecto anterior no pasa al siguiente.

Basics guarda esas decisiones en un [vault](https://marcozvd.github.io/basics/guide/glossary.html#vault): una carpeta de notas Markdown en texto plano que tus agentes leen por [MCP](https://marcozvd.github.io/basics/guide/glossary.html#mcp) antes de elegir un stack (las tecnologías que usa un proyecto) o escribir código. Lo que un agente quiera cambiar espera como una [propuesta](https://marcozvd.github.io/basics/guide/glossary.html#proposal) en tu inbox hasta que la apruebes.

El vault contiene:

- **Capas**: partes de tus aplicaciones, como backend, frontend y datos.
- **Tecnologías**: las que usas, como frameworks, bases de datos y herramientas de pruebas.
- **Prácticas**: reglas para usar bien una tecnología.
- **Checks**: comandos que verifican el trabajo, como pruebas y linters.
- **Perfiles**: stacks guardados para cada tipo de proyecto.

Empieza con packs oficiales (conjuntos de notas ya hechos) y pídele a Basics que recomiende tecnologías para un proyecto nuevo. Las notas son archivos normales, así que Obsidian y git también funcionan con ellas.

¿Palabras nuevas? Mira el [glosario](https://marcozvd.github.io/basics/guide/glossary.html). ¿Comparas opciones? Mira [cómo se compara Basics](https://marcozvd.github.io/basics/guide/comparison.html).

**Pruébalo:** [demo en vivo](https://marcozvd.github.io/basics/demo/) en tu navegador, sin instalar nada · [sitio web](https://marcozvd.github.io/basics/)

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
El resto de clientes (Cursor, VS Code, Codex, OpenCode, Windsurf, oh-my-pi, Gemini CLI, Qwen Code, Kimi CLI, Goose, Amp) están en
[Clientes MCP](https://marcozvd.github.io/basics/guide/mcp-clients.html). Cualquier otro agente recibe fragmentos para copiar con `basics connect --print`.

## Qué hace

- **Un vault que puedes leer** — capas, tecnologías, prácticas, checks, perfiles y proyectos como notas Markdown. Sin base de datos ni formatos propietarios.
- **Agentes que preguntan antes** — lo que escribe un agente se convierte en una propuesta en `inbox/` con motivo y diff; la apruebas desde la CLI o la UI.
- **Stacks recomendados** — ordena tecnologías por capa a partir de la descripción de un proyecto, por keywords o con embeddings locales opcionales.
- **Del stack al proyecto** — exporta `STACK.md`, `AGENTS.md`, `CLAUDE.md` y reglas de Cursor, y ejecuta los checks del stack en el proyecto.
- **Packs** — packs iniciales oficiales en inglés y español, además de packs comunitarios de cualquier repositorio de GitHub; las notas y actualizaciones nuevas llegan como propuestas al inbox, nunca como escrituras silenciosas.
- **UI web local y MCP** — interfaz React con editor, grafo, diff del inbox y banco de pruebas de recomendación, y MCP por HTTP o stdio.
- **Aplicación de escritorio** — la misma UI y servidor MCP en una ventana independiente residente en la bandeja, con su propio runtime de Node incluido; no hace falta npm. Ver [Aplicación de escritorio](https://marcozvd.github.io/basics/guide/desktop.html).
- **Skill para agentes** — un `SKILL.md` que enseña a Claude Code, OpenCode, Codex y a los demás agentes que configura `basics connect` cuándo usar cada herramienta de Basics. Ver [Skill para agentes](https://marcozvd.github.io/basics/guide/agent-skill.html).

![Una propuesta del agente revisada en el Inbox y luego un stack recomendado y exportado](site/public/media/basics-inbox-recommend.gif)

Mira el recorrido completo de dos minutos: [basics-demo.mp4](https://marcozvd.github.io/basics/media/basics-demo.mp4).

## Documentación

Documentación completa: **[marcozvd.github.io/basics](https://marcozvd.github.io/basics/)**

- **Empezar** — [Primeros pasos](https://marcozvd.github.io/basics/guide/getting-started.html) · [Conceptos](https://marcozvd.github.io/basics/guide/concepts.html) · [Glosario](https://marcozvd.github.io/basics/guide/glossary.html) · [Comparativa](https://marcozvd.github.io/basics/guide/comparison.html)
- **Uso** — [Notas](https://marcozvd.github.io/basics/guide/notes.html) · [Packs](https://marcozvd.github.io/basics/guide/packs.html) · [Clientes MCP](https://marcozvd.github.io/basics/guide/mcp-clients.html) · [UI web](https://marcozvd.github.io/basics/guide/web-ui.html) · [Recomendación](https://marcozvd.github.io/basics/guide/recommend.html) · [Proyectos y checks](https://marcozvd.github.io/basics/guide/projects-and-checks.html)
- **Operación** — [Seguridad](https://marcozvd.github.io/basics/guide/security.html) · [Problemas](https://marcozvd.github.io/basics/guide/troubleshooting.html) · [Estabilidad](https://marcozvd.github.io/basics/guide/stability.html)
- **Referencia** — [CLI](https://marcozvd.github.io/basics/reference/cli.html) · [Herramientas MCP](https://marcozvd.github.io/basics/reference/mcp-tools.html) · [Esquema del vault](https://marcozvd.github.io/basics/reference/schema.html)

Contribuciones: [CONTRIBUTING.md](CONTRIBUTING.md). Seguridad: [SECURITY.md](SECURITY.md).

## Licencia

MIT — consulta [LICENSE](LICENSE).
