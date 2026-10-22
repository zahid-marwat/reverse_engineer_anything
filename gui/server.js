import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, "..");
const PORT = 4123;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    res.writeHead(204);
    res.end();
    return;
  }

  // API endpoint: Get catalog
  if (url.pathname === "/api/catalog" && req.method === "GET") {
    const catalogPath = path.join(__dirname, "catalog.json");
    if (fs.existsSync(catalogPath)) {
      res.writeHead(200, { "Content-Type": "application/json" });
      fs.createReadStream(catalogPath).pipe(res);
    } else {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Catalog not found" }));
    }
    return;
  }

  // API endpoint: File / folder system browser
  if (url.pathname === "/api/browse" && req.method === "GET") {
    let dirPath = url.searchParams.get("dir") || "C:\\";
    dirPath = path.resolve(dirPath);

    try {
      if (!fs.existsSync(dirPath)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: `Directory does not exist: ${dirPath}` }),
        );
        return;
      }

      const stat = fs.statSync(dirPath);
      if (!stat.isDirectory()) {
        dirPath = path.dirname(dirPath);
      }

      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const items = entries.map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDir: e.isDirectory(),
        ext: path.extname(e.name).toLowerCase(),
      }));

      // Sort directories first, then files
      items.sort((a, b) => {
        if (a.isDir === b.isDir) return a.name.localeCompare(b.name);
        return a.isDir ? -1 : 1;
      });

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          currentDir: dirPath,
          parentDir: path.dirname(dirPath),
          items: items.slice(0, 500),
        }),
      );
    } catch (err) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // API endpoint: Get command schema / help
  if (url.pathname === "/api/schema" && req.method === "GET") {
    const cmd = url.searchParams.get("cmd");
    if (!cmd) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Missing cmd query parameter" }));
      return;
    }

    const scriptPath = path.join(rootDir, "scripts", "rea.mjs");
    const child = spawn(process.execPath, [scriptPath, "--schema", cmd], {
      cwd: rootDir,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (d) => (stdout += d.toString()));
    child.stderr.on("data", (d) => (stderr += d.toString()));

    child.on("close", () => {
      const helpChild = spawn(process.execPath, [scriptPath, cmd, "--help"], {
        cwd: rootDir,
      });
      let helpText = "";
      helpChild.stdout.on("data", (d) => (helpText += d.toString()));
      helpChild.on("close", (code) => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            cmd,
            schemaRaw: stdout,
            helpText,
            code,
          }),
        );
      });
    });
    return;
  }

  // API endpoint: Execute REA command
  if (url.pathname === "/api/execute" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        let { command, args = [], flags = {} } = payload;

        if (!command) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "Missing command" }));
          return;
        }

        const cmdArgs = [path.join(rootDir, "scripts", "rea.mjs"), command];

        // Clean and resolve path arguments if provided as relative or bare name
        if (Array.isArray(args)) {
          for (let a of args) {
            if (a !== undefined && a !== null && String(a).trim() !== "") {
              let strVal = String(a)
                .trim()
                .replace(/^"(.*)"$/, "$1"); // strip outer quotes
              // If it looks like a path but isn't rooted, try resolving against C:\ if not existing in cwd
              if (
                !path.isAbsolute(strVal) &&
                !strVal.startsWith("-") &&
                !strVal.startsWith("0x")
              ) {
                if (fs.existsSync(path.resolve(rootDir, strVal))) {
                  strVal = path.resolve(rootDir, strVal);
                } else if (fs.existsSync(path.join("C:\\", strVal))) {
                  strVal = path.join("C:\\", strVal);
                }
              }
              cmdArgs.push(strVal);
            }
          }
        }

        // Add flags
        if (typeof flags === "object" && flags !== null) {
          for (const [k, v] of Object.entries(flags)) {
            if (v === true) {
              cmdArgs.push(`--${k}`);
            } else if (
              v !== false &&
              v !== undefined &&
              v !== null &&
              String(v).trim() !== ""
            ) {
              cmdArgs.push(`--${k}`, String(v).trim());
            }
          }
        }

        const startTime = Date.now();
        const proc = spawn(process.execPath, cmdArgs, {
          cwd: rootDir,
          env: { ...process.env, NODE_OPTIONS: "--no-warnings" },
        });

        let stdout = "";
        let stderr = "";

        proc.stdout.on("data", (data) => (stdout += data.toString()));
        proc.stderr.on("data", (data) => (stderr += data.toString()));

        proc.on("close", (code) => {
          const durationMs = Date.now() - startTime;
          let parsedJson = null;
          try {
            parsedJson = JSON.parse(stdout);
          } catch {
            // Raw text output
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              command,
              executedArgs: cmdArgs.slice(2),
              exitCode: code,
              durationMs,
              stdout,
              stderr,
              json: parsedJson,
            }),
          );
        });

        proc.on("error", (err) => {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(
            JSON.stringify({
              error: err.message,
              stack: err.stack,
            }),
          );
        });
      } catch (err) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({ error: "Invalid JSON payload: " + err.message }),
        );
      }
    });
    return;
  }

  // API endpoint: Save findings to file
  if (url.pathname === "/api/save-result" && req.method === "POST") {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        const payload = JSON.parse(body);
        let { folderName = "mywork for testing", fileName, content } = payload;

        if (!content) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "No content to save" }));
          return;
        }

        const outDir = path.resolve(rootDir, folderName);
        if (!fs.existsSync(outDir)) {
          fs.mkdirSync(outDir, { recursive: true });
        }

        const finalFileName = fileName || `findings_${Date.now()}.json`;
        const outFilePath = path.join(outDir, finalFileName);

        fs.writeFileSync(outFilePath, content, "utf8");

        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(
          JSON.stringify({
            success: true,
            savedPath: outFilePath,
            fileName: finalFileName,
          }),
        );
      } catch (err) {
        res.writeHead(500, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: err.message }));
      }
    });
    return;
  }

  // Static file serving from /gui directory
  let filePath = path.join(
    __dirname,
    url.pathname === "/" ? "index.html" : url.pathname,
  );
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      filePath = path.join(__dirname, "index.html");
    }
    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || "application/octet-stream";

    res.writeHead(200, { "Content-Type": contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`REA Visual Studio GUI running at http://localhost:${PORT}`);
});
