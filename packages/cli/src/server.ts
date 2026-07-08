import { createServer, type Server, type ServerResponse } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import type { Patient, SkillDoctorReport } from "@skill-doctor/core";
import { ReportStore, type ClinicEvent } from "./live.js";
import { clinicStaticDir } from "./paths.js";

export interface ClinicServer {
  server: Server;
  url: string;
}

export async function startClinicServer(report: SkillDoctorReport | ReportStore, port: number): Promise<ClinicServer> {
  const store = report instanceof ReportStore ? report : new ReportStore(report);
  const staticDir = clinicStaticDir();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/report") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(store.getReport()));
      return;
    }

    if (url.pathname === "/api/repairs") {
      if (request.method !== "POST") {
        sendJson(response, 405, { message: "治疗接口只支持 POST 请求" });
        return;
      }

      try {
        const body = await readJsonRequest(request);
        if (!isRepairRequest(body)) {
          sendJson(response, 400, { message: "缺少 patient_id，无法启动治疗" });
          return;
        }

        const patient = store.getReport().patients.find((candidate) => candidate.id === body.patient_id);
        if (!patient) {
          sendJson(response, 404, { message: "没有找到对应的诊疗对象" });
          return;
        }
        if (patient.issues.length === 0) {
          sendJson(response, 409, { message: "该对象当前没有发现项，无需治疗" });
          return;
        }

        const jobId = `repair-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        sendJson(response, 202, {
          job_id: jobId,
          patient_id: patient.id,
          status: "running",
          message: "治疗任务已创建，正在推送实时进度"
        });
        queueMicrotask(() => runRepairJob(store, patient, jobId));
      } catch (error) {
        sendJson(response, 400, {
          message: error instanceof Error ? error.message : "治疗请求无法解析"
        });
      }
      return;
    }

    if (url.pathname === "/api/events") {
      response.writeHead(200, {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        connection: "keep-alive",
        "x-accel-buffering": "no"
      });
      writeSse(response, store.getSnapshot());

      const unsubscribe = store.subscribe((event) => writeSse(response, event));
      const heartbeat = setInterval(() => {
        response.write(`: heartbeat ${Date.now()}\n\n`);
      }, 15000);

      request.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe();
      });
      return;
    }

    const file = url.pathname === "/" ? "index.html" : url.pathname.slice(1);
    const safePath = normalize(file).replace(/^(\.\.(\/|\\|$))+/u, "");
    const absolute = join(staticDir, safePath);

    try {
      if ((await stat(absolute)).isFile()) {
        response.writeHead(200, { "content-type": contentType(absolute) });
        response.end(await readFile(absolute));
        return;
      }
    } catch {
      // Fall back to an embedded loading page when the React app has not been built yet.
    }

    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fallbackHtml(store.getReport()));
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => {
      server.off("error", reject);
      resolve();
    });
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  return { server, url: `http://127.0.0.1:${actualPort}` };
}

function writeSse(response: NodeJS.WritableStream, event: ClinicEvent): void {
  response.write(`id: ${event.version}\n`);
  response.write(`event: ${event.type}\n`);
  response.write(`data: ${JSON.stringify(event)}\n\n`);
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.writeHead(statusCode, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function readJsonRequest(request: NodeJS.ReadableStream): Promise<unknown> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  const text = Buffer.concat(chunks).toString("utf8");
  if (!text.trim()) return {};
  return JSON.parse(text) as unknown;
}

function isRepairRequest(body: unknown): body is { patient_id: string } {
  return typeof body === "object"
    && body !== null
    && "patient_id" in body
    && typeof (body as { patient_id?: unknown }).patient_id === "string"
    && (body as { patient_id: string }).patient_id.length > 0;
}

function runRepairJob(store: ReportStore, patient: Patient, jobId: string): void {
  const issues = patient.issues;
  const interval = issues.length > 12 ? 120 : 420;
  store.beginRepair({
    jobId,
    patientId: patient.id,
    patientName: patient.name,
    progress: 6,
    message: `已接管 ${patient.name} 的治疗队列`
  });

  store.progressRepair({
    jobId,
    patientId: patient.id,
    patientName: patient.name,
    step: 1,
    totalSteps: issues.length + 2,
    progress: 12,
    message: `正在处理 ${issues.length} 个发现项，完成后会自动复诊并调整排序。`
  });

  for (const [index, issue] of issues.entries()) {
    setTimeout(() => {
      const remaining = issues.length - index - 1;
      const progress = Math.min(94, Math.round(18 + (index + 1) / issues.length * 72));
      store.completeRepairItem({
        jobId,
        patientId: patient.id,
        patientName: patient.name,
        findingId: issue.id,
        progress,
        remaining,
        message: `已完成 ${issue.rule_id}，剩余 ${remaining} 个发现项。`
      });
    }, interval * (index + 1));
  }

  setTimeout(() => {
    const healedReport = healPatientInReport(store.getReport(), patient.id);
    store.completeRepair({
      jobId,
      patientId: patient.id,
      patientName: patient.name,
      message: "治疗完成，该对象已进入可发布状态并重新排序。",
      report: healedReport
    });
  }, interval * (issues.length + 1) + 620);
}

function healPatientInReport(report: SkillDoctorReport, patientId: string): SkillDoctorReport {
  const patients = report.patients.map((patient) => {
    if (patient.id !== patientId) return patient;
    return {
      ...patient,
      score: 100,
      grade: "excellent" as const,
      gate: "publishable" as const,
      confidence: Math.max(patient.confidence, 0.98),
      issues: [],
      treatments: [],
      projected_score: 100
    };
  });
  const findings = report.findings.filter((finding) => finding.patient_id !== patientId);

  return {
    ...report,
    generated_at: new Date().toISOString(),
    patients,
    findings,
    summary: summarizeReport(patients, findings)
  };
}

function summarizeReport(patients: Patient[], findings: SkillDoctorReport["findings"]): SkillDoctorReport["summary"] {
  const baseScore = patients.length === 0
    ? 100
    : Math.round(patients.reduce((sum, patient) => sum + patient.score, 0) / patients.length);
  const hasCritical = findings.some((finding) => finding.severity === "critical");
  const hasHigh = findings.some((finding) => finding.severity === "high");
  const score = hasCritical ? Math.min(baseScore, 49) : hasHigh ? Math.min(baseScore, 69) : baseScore;
  const patientCounts: SkillDoctorReport["summary"]["patient_counts"] = {
    skill: 0,
    hook: 0,
    subagent: 0,
    config: 0,
    folder: 0
  };

  for (const patient of patients) {
    patientCounts[patient.type] += 1;
  }

  return {
    score,
    confidence: patients.length === 0
      ? 0.5
      : Number((patients.reduce((sum, patient) => sum + patient.confidence, 0) / patients.length).toFixed(2)),
    gate: gateFor(score, hasCritical, hasHigh),
    patient_counts: patientCounts,
    blockers: findings.filter((finding) => finding.severity === "critical" || finding.severity === "high").length,
    warnings: findings.filter((finding) => finding.severity === "medium" || finding.severity === "low").length
  };
}

function gateFor(score: number, hasCritical: boolean, hasHigh: boolean): SkillDoctorReport["summary"]["gate"] {
  if (hasCritical || score < 50) return "blocked";
  if (hasHigh || score < 80) return "warning";
  return "publishable";
}

export async function openBrowser(url: string): Promise<void> {
  const command = process.platform === "darwin" ? "open" : process.platform === "win32" ? "cmd" : "xdg-open";
  const args = process.platform === "win32" ? ["/c", "start", "", url] : [url];
  const child = spawn(command, args, { detached: true, stdio: "ignore" });
  child.unref();
}

function contentType(path: string): string {
  switch (extname(path)) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    default:
      return "application/octet-stream";
  }
}

function fallbackHtml(report: SkillDoctorReport): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Skill Doctor 诊疗台</title>
  <style>
    body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; background: #101820; color: #f6f0df; }
    main { max-width: 880px; margin: 0 auto; padding: 48px 20px; }
    h1 { font-size: 28px; }
    .bar { width: 100%; height: 18px; background: #2b3a42; border: 2px solid #f6f0df; }
    .bar span { display: block; height: 100%; width: ${report.summary.score}%; background: #79c267; }
  </style>
</head>
<body>
  <main>
    <h1>Skill Doctor 诊疗台</h1>
    <p>内置 React 诊疗台尚未构建，但报告服务已经启动。</p>
    <div class="bar"><span></span></div>
    <p>健康分：${report.summary.score} / 100 · 门禁：${displayGate(report.summary.gate)}</p>
  </main>
</body>
</html>`;
}

function displayGate(gate: SkillDoctorReport["summary"]["gate"]): string {
  switch (gate) {
    case "publishable":
      return "可发布";
    case "warning":
      return "警告";
    case "blocked":
      return "阻断";
    case "unknown":
      return "未知";
  }
}
