import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative } from "node:path";

const IGNORED_DIRS = new Set([".git", "node_modules", "dist", "coverage", ".clinic-cache"]);

export async function pathExists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

export async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

export async function readText(path: string): Promise<string> {
  return readFile(path, "utf8");
}

export async function listChildren(path: string): Promise<string[]> {
  try {
    return await readdir(path);
  } catch {
    return [];
  }
}

export async function listFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(current: string) {
    let entries: string[];
    try {
      entries = await readdir(current);
    } catch {
      return;
    }

    for (const entry of entries) {
      if (IGNORED_DIRS.has(entry)) continue;
      const absolute = join(current, entry);
      let entryStat;
      try {
        entryStat = await stat(absolute);
      } catch {
        continue;
      }

      if (entryStat.isDirectory()) {
        await walk(absolute);
      } else if (entryStat.isFile()) {
        files.push(absolute);
      }
    }
  }

  await walk(root);
  return files;
}

export function toRelative(root: string, file: string): string {
  const rel = relative(root, file);
  return rel.length > 0 ? rel : file;
}
