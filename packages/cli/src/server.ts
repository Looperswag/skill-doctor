import { createServer, type Server } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { spawn } from "node:child_process";
import type { SkillDoctorReport } from "@skill-doctor/core";
import { clinicStaticDir } from "./paths.js";

export interface ClinicServer {
  server: Server;
  url: string;
}

export async function startClinicServer(report: SkillDoctorReport, port: number): Promise<ClinicServer> {
  const staticDir = clinicStaticDir();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");

    if (url.pathname === "/api/report") {
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(report));
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
    response.end(fallbackHtml(report));
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
  <title>Skill Doctor Clinic</title>
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
    <h1>Skill Doctor Clinic</h1>
    <p>The bundled React clinic has not been built yet, but the report server is running.</p>
    <div class="bar"><span></span></div>
    <p>Health score: ${report.summary.score} / 100 · Gate: ${report.summary.gate}</p>
  </main>
</body>
</html>`;
}
