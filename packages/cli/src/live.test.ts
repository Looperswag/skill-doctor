import type { SkillDoctorReport } from "@skill-doctor/core";
import { describe, expect, test } from "vitest";
import { ReportStore } from "./live.js";

describe("ReportStore", () => {
  test("publishes scan lifecycle events and keeps the latest report", () => {
    const initial = makeReport(49);
    const updated = makeReport(88);
    const store = new ReportStore(initial);
    const events: string[] = [];

    const unsubscribe = store.subscribe((event) => {
      events.push(event.type);
    });

    store.beginScan();
    store.completeScan(updated);
    unsubscribe();

    expect(events).toEqual(["scan:start", "scan:complete"]);
    expect(store.getReport().summary.score).toBe(88);
    expect(store.getSnapshot()).toMatchObject({
      type: "snapshot",
      state: "idle",
      report: updated
    });
  });

  test("keeps the last good report when a rescan fails", () => {
    const store = new ReportStore(makeReport(72));

    store.beginScan();
    store.failScan(new Error("扫描失败"));

    expect(store.getReport().summary.score).toBe(72);
    expect(store.getSnapshot()).toMatchObject({
      state: "error",
      error: "扫描失败"
    });
  });
});

export function makeReport(score: number): SkillDoctorReport {
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
