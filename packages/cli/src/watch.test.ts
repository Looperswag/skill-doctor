import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SkillDoctorReport } from "@skill-doctor/core";
import { describe, expect, test } from "vitest";
import { ReportStore, type ClinicEvent } from "./live.js";
import { createRescanScheduler, resolveWatchRoots } from "./watch.js";

describe("createRescanScheduler", () => {
  test("rescans, writes report artifacts, and updates the live store", async () => {
    const outDir = await mkdtemp(join(tmpdir(), "skill-doctor-watch-"));
    const store = new ReportStore(makeReport(42));
    const complete = waitForEvent(store, "scan:complete");
    const scheduler = createRescanScheduler({
      scanOptions: {},
      outDir,
      store,
      debounceMs: 1,
      scanFn: async () => makeReport(92),
      writeReportFilesFn: async (report, dir) => {
        await writeFile(join(dir, "report.json"), `${JSON.stringify(report)}\n`);
      }
    });

    try {
      scheduler.trigger("测试变更");
      await complete;

      const report = JSON.parse(await readFile(join(outDir, "report.json"), "utf8")) as SkillDoctorReport;
      expect(store.getReport().summary.score).toBe(92);
      expect(report.summary.score).toBe(92);
    } finally {
      scheduler.close();
    }
  });
});

describe("resolveWatchRoots", () => {
  test("uses runner homes when scanning a home directory", async () => {
    const roots = await resolveWatchRoots({ homeDir: "/tmp/clinic-home", runners: ["codex"] });

    expect(roots).toEqual([
      "/tmp/clinic-home/.agents",
      "/tmp/clinic-home/.codex"
    ]);
  });

  test("uses explicit scan paths directly", async () => {
    const roots = await resolveWatchRoots({ paths: ["/tmp/custom-skill"] });

    expect(roots).toEqual(["/tmp/custom-skill"]);
  });
});

function waitForEvent<T extends ClinicEvent["type"]>(store: ReportStore, type: T): Promise<Extract<ClinicEvent, { type: T }>> {
  return new Promise((resolve) => {
    const unsubscribe = store.subscribe((event) => {
      if (event.type !== type) return;
      unsubscribe();
      resolve(event as Extract<ClinicEvent, { type: T }>);
    });
  });
}

function makeReport(score: number): SkillDoctorReport {
  return {
    schema_version: "skill-doctor.report.v1",
    generated_at: new Date(score * 1000).toISOString(),
    summary: {
      score,
      confidence: 0.9,
      gate: score >= 80 ? "publishable" : "blocked",
      patient_counts: {
        skill: 0,
        hook: 0,
        subagent: 0,
        config: 0,
        folder: 0
      },
      blockers: score >= 80 ? 0 : 1,
      warnings: 0
    },
    patients: [],
    findings: []
  };
}
