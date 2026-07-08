import { watch, type FSWatcher } from "node:fs";
import { readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { scan, type ScanOptions, type SkillDoctorReport } from "@skill-doctor/core";
import { writeReportFiles } from "./io.js";
import type { ReportStore } from "./live.js";

export interface ClinicWatcher {
  watchedPaths: string[];
  trigger: (reason?: string) => void;
  close: () => void;
}

export interface ClinicWatcherOptions {
  scanOptions: ScanOptions;
  outDir: string;
  store: ReportStore;
  debounceMs?: number;
  watchRoots?: string[];
}

export interface RescanScheduler {
  trigger: (reason?: string) => void;
  close: () => void;
}

interface RescanSchedulerOptions {
  scanOptions: ScanOptions;
  outDir: string;
  store: ReportStore;
  debounceMs?: number;
  scanFn?: (options: ScanOptions) => Promise<SkillDoctorReport>;
  writeReportFilesFn?: (report: SkillDoctorReport, outDir: string) => Promise<void>;
}

export async function startClinicWatcher(options: ClinicWatcherOptions): Promise<ClinicWatcher> {
  const scheduler = createRescanScheduler(options);
  const watchedPaths = await existingWatchRoots(options.watchRoots ?? await resolveWatchRoots(options.scanOptions));
  const watchers: FSWatcher[] = [];

  for (const root of watchedPaths) {
    watchers.push(...(await watchRoot(root, scheduler.trigger)));
  }

  return {
    watchedPaths,
    trigger: scheduler.trigger,
    close: () => {
      scheduler.close();
      for (const watcher of watchers) watcher.close();
    }
  };
}

export function createRescanScheduler(options: RescanSchedulerOptions): RescanScheduler {
  const debounceMs = options.debounceMs ?? 700;
  const scanFn = options.scanFn ?? scan;
  const writeReportFilesFn = options.writeReportFilesFn ?? writeReportFiles;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  let queued = false;
  let closed = false;

  const run = async () => {
    if (closed) return;
    if (running) {
      queued = true;
      return;
    }

    running = true;
    options.store.beginScan();

    try {
      const report = await scanFn(options.scanOptions);
      await writeReportFilesFn(report, options.outDir);
      options.store.completeScan(report);
    } catch (error) {
      options.store.failScan(error);
    } finally {
      running = false;
      if (queued && !closed) {
        queued = false;
        schedule();
      }
    }
  };

  const schedule = () => {
    if (closed) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      void run();
    }, debounceMs);
  };

  return {
    trigger: () => schedule(),
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      timer = undefined;
    }
  };
}

export async function resolveWatchRoots(scanOptions: ScanOptions): Promise<string[]> {
  if (scanOptions.paths?.length) {
    return scanOptions.paths.map((path) => resolve(path));
  }

  const rootHome = scanOptions.homeDir ?? homedir();
  const runners = scanOptions.runners ?? ["codex", "claude"];
  const roots: string[] = [];

  if (runners.includes("codex")) {
    roots.push(join(rootHome, ".agents"), join(rootHome, ".codex"));
  }
  if (runners.includes("claude")) {
    roots.push(join(rootHome, ".claude"));
  }

  return [...new Set(roots.map((root) => resolve(root)))];
}

async function existingWatchRoots(paths: string[]): Promise<string[]> {
  const roots: string[] = [];

  for (const path of paths) {
    try {
      const info = await stat(path);
      roots.push(info.isDirectory() ? path : dirname(path));
    } catch {
      // Missing runner folders are normal for users who only use one agent.
    }
  }

  return [...new Set(roots)];
}

async function watchRoot(root: string, onChange: () => void): Promise<FSWatcher[]> {
  try {
    return [watch(root, { recursive: true }, (_event, filename) => {
      if (!shouldIgnore(filename?.toString())) onChange();
    })];
  } catch {
    const directories = await collectDirectories(root);
    const watchers: FSWatcher[] = [];
    for (const directory of directories) {
      try {
        watchers.push(watch(directory, (_event, filename) => {
          if (!shouldIgnore(filename?.toString())) onChange();
        }));
      } catch {
        // The watched tree may change while we attach watchers. A later parent event will rescan it.
      }
    }
    return watchers;
  }
}

async function collectDirectories(root: string): Promise<string[]> {
  const directories = [root];
  for (let index = 0; index < directories.length && directories.length < 400; index += 1) {
    const directory = directories[index];
    if (!directory) continue;
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const entry of entries) {
      if (!entry.isDirectory() || shouldIgnore(entry.name)) continue;
      directories.push(join(directory, entry.name));
    }
  }
  return directories;
}

function shouldIgnore(filename: string | undefined): boolean {
  if (!filename) return false;
  const parts = filename.split(/[\\/]/u);
  return parts.some((part) => {
    if (!part) return false;
    if (part === ".DS_Store" || part === ".git" || part === "node_modules" || part === "dist") return true;
    return part.endsWith(".tmp") || part.endsWith(".swp");
  });
}
