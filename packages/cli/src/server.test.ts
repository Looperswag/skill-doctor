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

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`请求失败：${response.status}`);
  return response.json() as Promise<T>;
}

async function readUntil(reader: ReadableStreamDefaultReader<Uint8Array>, expected: string): Promise<string> {
  const decoder = new TextDecoder();
  let output = "";
  const deadline = Date.now() + 2000;

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
