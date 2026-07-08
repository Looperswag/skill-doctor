import { describe, expect, test } from "vitest";
import { groupPatientsByWard, scoreTone } from "./report-model.js";
import type { SkillDoctorReport } from "./types.js";

const report: SkillDoctorReport = {
  schema_version: "skill-doctor.report.v1",
  generated_at: "2026-07-08T00:00:00.000Z",
  summary: {
    score: 62,
    confidence: 0.82,
    gate: "warning",
    patient_counts: { skill: 1, hook: 1, subagent: 0, config: 0, folder: 0 },
    blockers: 1,
    warnings: 1
  },
  patients: [
    {
      id: "codex:skill:demo",
      type: "skill",
      name: "demo-skill",
      path: "/tmp/demo",
      runner: "codex",
      scope: "fixture",
      score: 44,
      grade: "critical",
      gate: "blocked",
      confidence: 0.8,
      issues: [],
      treatments: [],
      projected_score: 68
    },
    {
      id: "claude:hook:settings",
      type: "hook",
      name: "settings.json",
      path: "/tmp/settings.json",
      runner: "claude",
      scope: "fixture",
      score: 84,
      grade: "good",
      gate: "publishable",
      confidence: 0.92,
      issues: [],
      treatments: [],
      projected_score: 90
    }
  ],
  findings: []
};

describe("report-model", () => {
  test("groups patients into runner wards", () => {
    const wards = groupPatientsByWard(report);

    expect(wards.map((ward) => ward.id)).toEqual(["codex", "claude"]);
    expect(wards[0]?.patients[0]?.name).toBe("demo-skill");
    expect(wards[1]?.averageScore).toBe(84);
  });

  test("maps scores to stable treatment tones", () => {
    expect(scoreTone(95)).toBe("excellent");
    expect(scoreTone(81)).toBe("good");
    expect(scoreTone(72)).toBe("warning");
    expect(scoreTone(56)).toBe("risky");
    expect(scoreTone(12)).toBe("critical");
  });
});
