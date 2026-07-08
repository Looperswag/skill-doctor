import { describe, expect, test } from "vitest";
import {
  averageProjectedScore,
  buildRecoverySeries,
  groupPatientsByWard,
  scoreTone,
  severityBreakdown,
  summarizeFindingCount
} from "./report-model.js";
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

    expect(wards.map((ward) => ward.label)).toEqual(["Codex 病区", "Claude 病区"]);
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

  test("uses Simplified Chinese for empty finding summaries", () => {
    expect(summarizeFindingCount(report.patients[0]!)).toBe("无发现项");
  });

  test("derives projected average score from patients", () => {
    expect(averageProjectedScore(report.patients)).toBe(79);
    expect(averageProjectedScore([])).toBe(100);
  });

  test("builds stable recovery chart series from patients", () => {
    expect(buildRecoverySeries(report.patients)).toEqual([
      { id: "codex:skill:demo", label: "demo-skill", score: 44, projectedScore: 68 },
      { id: "claude:hook:settings", label: "settings.json", score: 84, projectedScore: 90 }
    ]);
  });

  test("summarizes finding severity distribution", () => {
    const baseFinding = {
      rule_id: "DEMO",
      category: "demo",
      file: "SKILL.md",
      evidence: "demo",
      message: "demo",
      suggestion: "demo",
      autofix: "manual",
      deduction: 10,
      patient_id: "codex:skill:demo"
    };

    expect(severityBreakdown([
      { ...baseFinding, id: "critical", severity: "critical" },
      { ...baseFinding, id: "high", severity: "high" },
      { ...baseFinding, id: "medium", severity: "medium" }
    ])).toEqual({
      critical: 1,
      high: 1,
      medium: 1,
      low: 0,
      info: 0,
      total: 3
    });
  });
});
