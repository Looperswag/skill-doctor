import type { Server } from "node:http";
import type { SkillDoctorReport } from "@skill-doctor/core";
import { describe, expect, test } from "vitest";
import { ReportStore } from "./live.js";
import { startClinicServer } from "./server.js";

describe("startClinicServer", () => {
  test("serves the latest report and streams live update events", async () => {
    const store = new ReportStore(makeReport(49));
    const clinic = await startClinicServer(store, 0);
    const stream = await fetch(`${clinic.url}/api/events`);
    const reader = stream.body?.getReader();

    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    if (!reader) throw new Error("事件流不可读");

    try {
      store.beginScan();
      store.completeScan(makeReport(91));

      const eventText = await readUntil(reader, "event: scan:complete");
      expect(eventText).toContain("\"score\":91");

      const report = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(report.summary.score).toBe(91);
    } finally {
      await reader.cancel();
      await closeServer(clinic.server);
    }
  });

  test("accepts a repair request and streams repair progress", async () => {
    const store = new ReportStore(makeRepairReport());
    const clinic = await startClinicServer(store, 0);
    const stream = await fetch(`${clinic.url}/api/events`);
    const reader = stream.body?.getReader();

    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    if (!reader) throw new Error("事件流不可读");

    try {
      const repair = await fetchJson<{ job_id: string; status: string; message: string }>(`${clinic.url}/api/repairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: "codex:skill:demo" })
      });

      expect(repair.status).toBe("running");
      expect(repair.job_id).toMatch(/^repair-/u);

      const itemText = await readUntil(reader, "event: repair:item-complete");
      expect(itemText).toContain("\"finding_id\":\"finding-1\"");

      const eventText = await readUntil(reader, "event: repair:complete");
      expect(eventText).toContain("\"patient_id\":\"codex:skill:demo\"");
      expect(eventText).toContain("\"progress\":100");

      const updated = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(updated.patients[0]).toMatchObject({
        id: "codex:skill:demo",
        score: 100,
        projected_score: 100,
        gate: "publishable",
        grade: "excellent",
        issues: []
      });
      expect(updated.findings).toEqual([]);
      expect(updated.summary.gate).toBe("publishable");
      expect(updated.summary.blockers).toBe(0);
    } finally {
      await reader.cancel();
      await closeServer(clinic.server);
    }
  });
});

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

function makeRepairReport(): SkillDoctorReport {
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
    autofix: "review_required" as const,
    deduction: 20,
    patient_id: "codex:skill:demo"
  };

  return {
    ...makeReport(49),
    summary: {
      ...makeReport(49).summary,
      patient_counts: {
        skill: 1,
        hook: 0,
        subagent: 0,
        config: 0,
        folder: 0
      }
    },
    patients: [
      {
        id: "codex:skill:demo",
        type: "skill",
        name: "demo-skill",
        path: "/tmp/demo-skill",
        runner: "codex",
        scope: "fixture",
        score: 49,
        grade: "critical",
        gate: "blocked",
        confidence: 0.9,
        issues: [finding],
        treatments: [
          {
            priority: "high",
            title: "补齐引用资源",
            suggestion: "创建 references/missing.md。",
            autofix: "review_required",
            projected_gain: 20
          }
        ],
        projected_score: 72
      }
    ],
    findings: [finding]
  };
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  return response.json() as Promise<T>;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + 4000;

  while (!output.includes(expected)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error(`等待事件超时：${expected}\n${output}`);

    const result = await Promise.race([
      reader.read(),
      delay(remaining).then(() => ({ timeout: true as const }))
    ]);

    if ("timeout" in result) throw new Error(`等待事件超时：${expected}\n${output}`);
    if (result.done) break;
    output += decoder.decode(result.value, { stream: true });
  }

  return output;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function delay(ms: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, ms));
}
