import { cp, mkdir, rename, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

export type InstallTarget = "codex" | "claude" | "both";

export interface InstallSkillOptions {
  homeDir: string;
  target: InstallTarget;
  templateDir?: string;
}

export interface InstallResult {
  runner: "codex" | "claude";
  destination: string;
  backupPath?: string;
}

export async function installSkill(options: InstallSkillOptions): Promise<InstallResult[]> {
  const templateDir = options.templateDir ?? defaultTemplateDir();
  const runners = options.target === "both" ? (["codex", "claude"] as const) : ([options.target] as const);
  const results: InstallResult[] = [];

  for (const runner of runners) {
    const destination = runner === "codex"
      ? join(options.homeDir, ".agents", "skills", "skill-doctor")
      : join(options.homeDir, ".claude", "skills", "skill-doctor");
    await mkdir(dirname(destination), { recursive: true });

    let backupPath: string | undefined;
    if (await exists(destination)) {
      backupPath = `${destination}.backup-${new Date().toISOString().replace(/[:.]/gu, "-")}`;
      await rename(destination, backupPath);
    }

    await cp(templateDir, destination, { recursive: true });
    const result: InstallResult = { runner, destination };
    if (backupPath) result.backupPath = backupPath;
    results.push(result);
  }

  return results;
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

function defaultTemplateDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, "..", "templates", "skill-doctor");
}
