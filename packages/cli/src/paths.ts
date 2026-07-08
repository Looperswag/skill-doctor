import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export function packageRoot(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "..");
}

export function fixtureHome(name: string): string {
  if (name !== "demo") {
    throw new Error(`Unknown fixture "${name}". Available fixtures: demo`);
  }
  return join(packageRoot(), "fixtures", "demo-home");
}

export function clinicStaticDir(): string {
  return join(packageRoot(), "clinic");
}
