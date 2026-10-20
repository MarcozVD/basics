#!/usr/bin/env node
import { resolveVaultDir } from "@marcozvd/basics-core";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./tools.js";

const root = resolveVaultDir(process.argv[2]);
await createMcpServer(() => root).connect(new StdioServerTransport());
