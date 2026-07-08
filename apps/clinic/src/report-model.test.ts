import { describe, expect, test } from "vitest";
import {
  averageProjectedScore,
  buildMarkdownSummary,
  buildRecoverySeries,
  groupPatientsByWard,
  scoreTone,
  severityBreakdown,
  sortPatientsByUrgency,
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

  test("prioritizes low-score patients and limits recovery chart density", () => {
    const manyPatients = [
      ...report.patients,
      ...Array.from({ length: 14 }, (_, index) => ({
        ...report.patients[1]!,
        id: `claude:hook:extra-${index}`,
        name: `extra-${index}`,
        score: index === 3 ? 12 : 70 + index,
        projected_score: index === 3 ? 55 : 90
      }))
    ];

    expect(sortPatientsByUrgency(manyPatients)[0]?.name).toBe("extra-3");
    expect(buildRecoverySeries(manyPatients)).toHaveLength(12);
    expect(buildRecoverySeries(manyPatients)[0]).toMatchObject({ label: "extra-3", score: 12 });
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

  test("exports a complete markdown treatment report", () => {
    const finding = {
      id: "finding-1",
      rule_id: "REF_MISSING",
      severity: "high" as const,
      category: "reference",
      file: "SKILL.md",
      span: { line: 6, column: 1 },
      evidence: "references/missing.md",
      message: "Skill 指令引用了不存在的内置资源。",
      suggestion: "创建被引用的文件，或将该路径改写为明确的示例路径。",
      autofix: "manual",
      deduction: 20,
      patient_id: "codex:skill:demo"
    };
    const reportWithFindings: SkillDoctorReport = {
      ...report,
      findings: [finding],
      patients: [
        {
          ...report.patients[0]!,
          issues: [finding],
          treatments: [
            {
              priority: "high",
              title: "补齐引用资源",
              suggestion: "创建 references/missing.md。",
              autofix: "manual",
              projected_gain: 20
            }
          ]
        }
      ]
    };

    const markdown = buildMarkdownSummary(reportWithFindings);

    expect(markdown).toContain("# Skill Doctor 治疗报告");
    expect(markdown).toContain("## 面板总览");
    expect(markdown).toContain("当前健康分：62 / 100");
    expect(markdown).toContain("预计恢复分：68 / 100");
    expect(markdown).toContain("## 病区评测");
    expect(markdown).toContain("Codex 病区");
    expect(markdown).toContain("## 病人明细");
    expect(markdown).toContain("demo-skill");
    expect(markdown).toContain("/tmp/demo");
    expect(markdown).toContain("REF_MISSING");
    expect(markdown).toContain("SKILL.md:6");
    expect(markdown).toContain("references/missing.md");
    expect(markdown).toContain("创建被引用的文件");
    expect(markdown).toContain("补齐引用资源");
  });
});
