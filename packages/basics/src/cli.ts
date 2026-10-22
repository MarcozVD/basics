#!/usr/bin/env node
import { buildProgram, handleCliError } from "./program.js";

buildProgram().parseAsync().catch(handleCliError);
