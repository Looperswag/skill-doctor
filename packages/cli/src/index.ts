#!/usr/bin/env node
import { createProgram } from "./program.js";

try {
  await createProgram().parseAsync(process.argv);
} catch (error) {
  if (isCommanderExit(error)) {
    process.exit(error.exitCode);
  }
  throw error;
}

function isCommanderExit(error: unknown): error is { code: string; exitCode: number } {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; exitCode?: unknown };
  return typeof candidate.code === "string"
    && candidate.code.startsWith("commander.")
    && typeof candidate.exitCode === "number";
}
