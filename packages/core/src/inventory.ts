import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { PatientDraft, Runner, ScanOptions } from "./types.js";
import { isDirectory, listChildren, pathExists } from "./fs-utils.js";

export async function discoverPatients(options: ScanOptions): Promise<PatientDraft[]> {
  const runners = options.runners ?? ["codex", "claude"];
  const homeDir = options.homeDir ?? homedir();
  const patients: PatientDraft[] = [];

  for (const runner of runners) {
    if (runner === "codex") {
      patients.push(...(await discoverSkillDirs(join(homeDir, ".agents", "skills"), runner, "user")));
      patients.push(...(await discoverSkillDirs(join(homeDir, ".codex", "skills"), runner, "legacy")));
      patients.push(...(await discoverAgentFiles(join(homeDir, ".codex", "agents"), runner, "user")));
      patients.push(...(await discoverConfigFiles([join(homeDir, ".codex", "hooks.json")], runner, "user", "hook")));
      patients.push(...(await discoverConfigFiles([join(homeDir, ".codex", "config.toml")], runner, "user", "config")));
    }

    if (runner === "claude") {
      patients.push(...(await discoverSkillDirs(join(homeDir, ".claude", "skills"), runner, "user")));
      patients.push(...(await discoverAgentFiles(join(homeDir, ".claude", "agents"), runner, "user")));
      patients.push(...(await discoverConfigFiles([join(homeDir, ".claude", "settings.json")], runner, "user", "config")));
    }
  }

  for (const path of options.paths ?? []) {
    if (await pathExists(join(path, "SKILL.md"))) {
      patients.push({
        id: makeId("generic", "skill", path),
        type: "skill",
        name: basename(path),
        path,
        runner: "generic",
        scope: "project"
      });
    } else if (await isDirectory(path)) {
      patients.push({
        id: makeId("generic", "folder", path),
        type: "folder",
        name: basename(path),
        path,
        runner: "generic",
        scope: "project"
      });
    }
  }

  return dedupePatients(patients);
}

async function discoverSkillDirs(root: string, runner: Runner, scope: PatientDraft["scope"]): Promise<PatientDraft[]> {
  if (!(await isDirectory(root))) return [];
  const children = await listChildren(root);
  const patients: PatientDraft[] = [];

  for (const child of children) {
    const childPath = join(root, child);
    if (!(await isDirectory(childPath))) continue;
    patients.push({
      id: makeId(runner, "skill", childPath),
      type: "skill",
      name: child,
      path: childPath,
      runner,
      scope
    });
  }

  return patients;
}

async function discoverAgentFiles(root: string, runner: Runner, scope: PatientDraft["scope"]): Promise<PatientDraft[]> {
  if (!(await isDirectory(root))) return [];
  const children = await listChildren(root);
  const patients: PatientDraft[] = [];

  for (const child of children) {
    if (!child.endsWith(".md") && !child.endsWith(".toml")) continue;
    const childPath = join(root, child);
    patients.push({
      id: makeId(runner, "subagent", childPath),
      type: "subagent",
      name: child.replace(/\.(md|toml)$/u, ""),
      path: childPath,
      runner,
      scope
    });
  }

  return patients;
}

async function discoverConfigFiles(
  files: string[],
  runner: Runner,
  scope: PatientDraft["scope"],
  type: PatientDraft["type"]
): Promise<PatientDraft[]> {
  const patients: PatientDraft[] = [];

  for (const file of files) {
    if (!(await pathExists(file))) continue;
    patients.push({
      id: makeId(runner, type, file),
      type,
      name: basename(file),
      path: file,
      runner,
      scope
    });
  }

  return patients;
}

function dedupePatients(patients: PatientDraft[]): PatientDraft[] {
  const seen = new Set<string>();
  return patients.filter((patient) => {
    if (seen.has(patient.id)) return false;
    seen.add(patient.id);
    return true;
  });
}

function makeId(runner: Runner, type: PatientDraft["type"], path: string): string {
  return `${runner}:${type}:${path}`;
}
