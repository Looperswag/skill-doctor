import type { Server } from "node:http";
import type { SkillDoctorReport } from "@skill-doctor/core";
import { describe, expect, test } from "vitest";
import { ReportStore } from "./live.js";
import { RepairCoordinator } from "./repair.js";
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

  test("keeps report state factual after a manual-only repair flow", async () => {
    const store = new ReportStore(makeRepairReport());
    const coordinator = new RepairCoordinator({
      store,
      scanFn: async () => makeRepairReport(),
      stepDelayMs: 1
    });
    const clinic = await startClinicServer(store, 0, { repairCoordinator: coordinator });
    const stream = await fetch(`${clinic.url}/api/events`);
    const reader = stream.body?.getReader();

    expect(stream.headers.get("content-type")).toContain("text/event-stream");
    if (!reader) throw new Error("事件流不可读");

    try {
      const repair = await fetchJson<{ job_id: string; total: number; manual_required: number }>(`${clinic.url}/api/repairs`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ patient_id: "codex:skill:demo" })
      });

      expect(repair.total).toBe(1);
      expect(repair.manual_required).toBe(1);
      expect(repair.job_id).toMatch(/^repair-/u);

      const itemText = await readUntil(reader, "event: repair:item-skipped");
      expect(itemText).toContain("\"finding_id\":\"finding-1\"");

      const eventText = itemText.includes("event: repair:batch-complete")
        ? itemText
        : await readUntil(reader, "event: repair:batch-complete");
      expect(eventText).toContain("\"manual_required\":1");

      const updated = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(updated.patients[0]).toMatchObject({
        id: "codex:skill:demo",
        score: 49,
        gate: "blocked"
      });
      expect(updated.patients[0]?.issues).toHaveLength(1);
      expect(updated.summary.gate).toBe("blocked");
      expect(updated.summary.blockers).toBe(1);
    } finally {
      await reader.cancel();
      await closeServer(clinic.server);
    }
  });

  test("runs one-click repair as a single batch without optimistic report healing", async () => {
    const initial = makeRepairReport([
      { id: "finding-1", patientId: "codex:skill:demo-a", autofix: "review_required" },
      { id: "finding-2", patientId: "codex:skill:demo-b", autofix: "manual_only" }
    ]);
    const store = new ReportStore(initial);
    const coordinator = new RepairCoordinator({
      store,
      scanFn: async () => initial,
      stepDelayMs: 1
    });
    const clinic = await startClinicServer(store, 0, { repairCoordinator: coordinator });
    const stream = await fetch(`${clinic.url}/api/events`);
    const reader = stream.body?.getReader();

    if (!reader) throw new Error("事件流不可读");

    try {
      const repair = await fetchJson<{ job_id: string; total: number; manual_required: number }>(`${clinic.url}/api/repairs/all`, {
        method: "POST"
      });

      expect(repair.total).toBe(2);
      expect(repair.manual_required).toBe(2);

      const eventText = await readUntil(reader, "event: repair:batch-complete");
      expect(eventText).toContain("\"total\":2");

      const updated = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(updated.patients.map((patient) => patient.gate)).toEqual(["blocked", "blocked"]);
      expect(updated.findings).toHaveLength(2);
    } finally {
      await reader.cancel();
      await closeServer(clinic.server);
    }
  });

  test("rejects a second repair batch while one-click repair is running", async () => {
    const initial = makeRepairReport([
      { id: "finding-1", patientId: "codex:skill:demo-a", autofix: "review_required" },
      { id: "finding-2", patientId: "codex:skill:demo-b", autofix: "manual_only" }
    ]);
    const store = new ReportStore(initial);
    const coordinator = new RepairCoordinator({
      store,
      scanFn: async () => initial,
      stepDelayMs: 40
    });
    const clinic = await startClinicServer(store, 0, { repairCoordinator: coordinator });

    try {
      const first = await fetch(`${clinic.url}/api/repairs/all`, { method: "POST" });
      const second = await fetch(`${clinic.url}/api/repairs/all`, { method: "POST" });
      const secondBody = await second.json() as { message?: string };

      expect(first.status).toBe(202);
      expect(second.status).toBe(409);
      expect(secondBody.message).toContain("已有治疗任务运行中");
    } finally {
      await closeServer(clinic.server);
    }
  });

  test("marks safe autofix publishable only after the final rescan confirms it", async () => {
    const initial = makeRepairReport([
      { id: "finding-1", patientId: "codex:skill:demo", autofix: "safe_autofix" }
    ]);
    const clean = makeHealthyRepairReport(["codex:skill:demo"]);
    let releaseScan!: () => void;
    const scanGate = new Promise<void>((resolve) => {
      releaseScan = resolve;
    });
    const store = new ReportStore(initial);
    const coordinator = new RepairCoordinator({
      store,
      scanFn: async () => {
        await scanGate;
        return clean;
      },
      applySafeAutofixFn: async () => ({
        applied: true,
        message: "已写入安全修复"
      }),
      stepDelayMs: 1
    });
    const clinic = await startClinicServer(store, 0, { repairCoordinator: coordinator });
    const stream = await fetch(`${clinic.url}/api/events`);
    const reader = stream.body?.getReader();

    if (!reader) throw new Error("事件流不可读");

    try {
      const repair = await fetchJson<{ auto_fixable: number; manual_required: number }>(`${clinic.url}/api/repairs/all`, {
        method: "POST"
      });
      expect(repair.auto_fixable).toBe(1);
      expect(repair.manual_required).toBe(0);

      await readUntil(reader, "event: repair:item-applied");
      const beforeRescan = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(beforeRescan.summary.gate).toBe("blocked");
      expect(beforeRescan.findings).toHaveLength(1);

      releaseScan();
      await readUntil(reader, "event: repair:batch-complete");

      const afterRescan = await fetchJson<SkillDoctorReport>(`${clinic.url}/api/report`);
      expect(afterRescan.summary.gate).toBe("publishable");
      expect(afterRescan.findings).toHaveLength(0);
      expect(afterRescan.patients[0]).toMatchObject({
        id: "codex:skill:demo",
        gate: "publishable"
      });
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

function makeRepairReport(inputs = [{ id: "finding-1", patientId: "codex:skill:demo", autofix: "review_required" as const }]): SkillDoctorReport {
  const findings = inputs.map((input, index) => ({
    id: input.id,
    rule_id: "REF_MISSING",
    severity: "high" as const,
    category: "reference",
    file: "SKILL.md",
    span: { line: 6, column: 1 },
    evidence: "references/missing.md",
    message: "Skill 指令引用了不存在的内置资源。",
    suggestion: "创建被引用的文件，或将该路径改写为明确的示例路径。",
    autofix: input.autofix,
    deduction: 20,
    patient_id: input.patientId
  }));

  return {
    ...makeReport(49),
    summary: {
      ...makeReport(49).summary,
      patient_counts: {
        skill: findings.length,
        hook: 0,
        subagent: 0,
        config: 0,
        folder: 0
      }
    },
    patients: findings.map((finding, index) => (
      {
        id: finding.patient_id,
        type: "skill",
        name: `demo-skill-${index + 1}`,
        path: `/tmp/demo-skill-${index + 1}`,
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
            autofix: finding.autofix,
            projected_gain: 20
          }
        ],
        projected_score: 72
      }
    )),
    findings
  };
}

function makeHealthyRepairReport(patientIds: string[]): SkillDoctorReport {
  return {
    ...makeReport(95),
    summary: {
      ...makeReport(95).summary,
      patient_counts: {
        skill: patientIds.length,
        hook: 0,
        subagent: 0,
        config: 0,
        folder: 0
      },
      blockers: 0,
      warnings: 0
    },
    patients: patientIds.map((patientId, index) => ({
      id: patientId,
      type: "skill",
      name: `demo-skill-${index + 1}`,
      path: `/tmp/demo-skill-${index + 1}`,
      runner: "codex",
      scope: "fixture",
      score: 95,
      grade: "excellent",
      gate: "publishable",
      confidence: 0.95,
      issues: [],
      treatments: [],
      projected_score: 95
    })),
    findings: []
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
