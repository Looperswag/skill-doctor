import { homedir, tmpdir } from "node:os";
import { mkdtemp } from "node:fs/promises";
import { join } from "node:path";
import { Command } from "commander";
import { scan, type Runner, type ScanOptions } from "@skill-doctor/core";
import { installSkill, type InstallTarget } from "./install.js";
import { fixtureHome } from "./paths.js";
import { formatReport, readReport, writeReportFiles, type OutputFormat } from "./io.js";
import { ReportStore } from "./live.js";
import { openBrowser, startClinicServer } from "./server.js";
import { startClinicWatcher } from "./watch.js";

interface ProgramEnv {
  stdout?: NodeJS.WritableStream;
  stderr?: NodeJS.WritableStream;
}

export function createProgram(env: ProgramEnv = {}): Command {
  const stdout = env.stdout ?? process.stdout;
  const stderr = env.stderr ?? process.stderr;
  const program = new Command();
  program
    .name("skill-doctor")
    .description("Diagnose Agent skills, hooks, subagents, and config as a pixel clinic.")
    .version("0.1.0")
    .exitOverride()
    .configureOutput({
      writeOut: (text) => stdout.write(text),
      writeErr: (text) => stderr.write(text)
    });

  program
    .command("scan")
    .argument("[path]", "Specific skill or customization folder to scan")
    .option("--home", "Scan the current user's agent home folders")
    .option("--fixture <name>", "Use a bundled fixture home, e.g. demo")
    .option("--runner <list>", "Comma-separated runner list", "codex,claude")
    .option("--format <format>", "json, markdown, or sarif", "json")
    .option("--out <dir>", "Write report.json, summary.md, and findings.jsonl")
    .action(async (target: string | undefined, options: Record<string, string | boolean | undefined>) => {
      const scanOptions = buildScanOptions(options, target);
      const report = await scan(scanOptions);
      if (options.out) await writeReportFiles(report, String(options.out));
      stdout.write(formatReport(report, parseFormat(String(options.format ?? "json"))));
    });

  program
    .command("clinic")
    .description("Scan and launch the bundled local pixel clinic.")
    .option("--home", "Scan the current user's agent home folders")
    .option("--fixture <name>", "Use a bundled fixture home, e.g. demo")
    .option("--runner <list>", "Comma-separated runner list", "codex,claude")
    .option("--port <port>", "Local server port", "0")
    .option("--out <dir>", "Write report artifacts before serving")
    .option("--no-open", "Do not open a browser")
    .option("--no-watch", "Disable live rescans when scanned files change")
    .action(async (options: Record<string, string | boolean | undefined>) => {
      const scanOptions = buildScanOptions(options);
      const report = await scan(scanOptions);
      const outDir = options.out ? String(options.out) : await mkdtemp(join(tmpdir(), "skill-doctor-clinic-"));
      await writeReportFiles(report, outDir);
      const store = new ReportStore(report);
      const clinic = await startClinicServer(store, Number(options.port ?? 0));
      const watcher = options.watch === false
        ? undefined
        : await startClinicWatcher({ scanOptions, outDir, store });
      stdout.write(`Skill Doctor clinic: ${clinic.url}\nReport artifacts: ${outDir}\n`);
      stdout.write(`Live watch: ${watcher ? `enabled (${watcher.watchedPaths.length} roots)` : "disabled"}\n`);
      if (options.open !== false) await openBrowser(clinic.url);
      try {
        await waitForStop(clinic.server);
      } finally {
        watcher?.close();
      }
    });

  program
    .command("install-skill")
    .option("--target <target>", "codex, claude, or both", "both")
    .option("--home <dir>", "Override home directory")
    .action(async (options: Record<string, string | undefined>) => {
      const results = await installSkill({
        homeDir: options.home ?? homedir(),
        target: parseInstallTarget(options.target ?? "both")
      });
      for (const result of results) {
        stdout.write(`${result.runner}: installed to ${result.destination}`);
        if (result.backupPath) stdout.write(` (backup: ${result.backupPath})`);
        stdout.write("\n");
      }
    });

  program
    .command("report")
    .argument("<report>", "Path to report.json")
    .option("--format <format>", "json, markdown, or sarif", "markdown")
    .action(async (reportPath: string, options: Record<string, string | undefined>) => {
      const report = await readReport(reportPath);
      stdout.write(formatReport(report, parseFormat(options.format ?? "markdown")));
    });

  program
    .command("fix")
    .option("--fixture <name>", "Use a bundled fixture home, e.g. demo")
    .option("--dry-run", "Print proposed treatments without modifying files")
    .option("--apply", "Apply safe fixes. V1 only supports dry-run.")
    .action(async (options: Record<string, string | boolean | undefined>) => {
      if (!options.dryRun && !options.apply) {
        throw new Error("Refusing to modify files without --dry-run or --apply.");
      }
      if (options.apply) {
        throw new Error("Apply mode is intentionally disabled in V1. Use --dry-run.");
      }
      const report = await scan(buildScanOptions({ ...options, runner: "codex,claude" }));
      stdout.write(renderTreatments(report.findings.map((finding) => finding.suggestion)));
    });

  return program;
}

function buildScanOptions(options: Record<string, string | boolean | undefined>, target?: string): ScanOptions {
  const scanOptions: ScanOptions = {
    runners: parseRunners(String(options.runner ?? "codex,claude"))
  };
  const homeDir = resolveHome(options);
  if (homeDir) scanOptions.homeDir = homeDir;
  if (target) scanOptions.paths = [target];
  return scanOptions;
}

function resolveHome(options: Record<string, string | boolean | undefined>): string | undefined {
  if (typeof options.fixture === "string") return fixtureHome(options.fixture);
  if (options.home === true) return homedir();
  return undefined;
}

function parseRunners(value: string): Runner[] {
  const runners = value.split(",").map((runner) => runner.trim()).filter(Boolean);
  return runners.map((runner) => {
    if (runner === "codex" || runner === "claude" || runner === "generic") return runner;
    throw new Error(`Unknown runner "${runner}"`);
  });
}

function parseFormat(value: string): OutputFormat {
  if (value === "json" || value === "markdown" || value === "sarif") return value;
  throw new Error(`Unknown format "${value}"`);
}

function parseInstallTarget(value: string): InstallTarget {
  if (value === "codex" || value === "claude" || value === "both") return value;
  throw new Error(`Unknown install target "${value}"`);
}

function renderTreatments(suggestions: string[]): string {
  if (suggestions.length === 0) return "No treatments proposed.\n";
  return suggestions.map((suggestion, index) => `${index + 1}. ${suggestion}`).join("\n") + "\n";
}

async function waitForStop(server: { close: (callback: () => void) => void }): Promise<void> {
  await new Promise<void>((resolve) => {
    const stop = () => server.close(resolve);
    process.once("SIGINT", stop);
    process.once("SIGTERM", stop);
  });
}
