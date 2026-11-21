// Startup file for cPanel "Setup Node.js App" (Passenger). Run `npm run build` first.
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const { createServer } = require("http");
const next = require("next");

// Auto-unpack next-build.tar.gz if newer than .next/BUILD_ID (for git-pull deploys on LVE).
const tarPath = path.join(__dirname, "next-build.tar.gz");
const buildIdPath = path.join(__dirname, ".next", "BUILD_ID");
if (fs.existsSync(tarPath)) {
  const tarTime = fs.statSync(tarPath).mtimeMs;
  const buildTime = fs.existsSync(buildIdPath) ? fs.statSync(buildIdPath).mtimeMs : 0;
  if (tarTime > buildTime) {
    execFileSync("tar", ["-xzf", tarPath, "-C", __dirname], { stdio: "inherit" });
  }
}

const app = next({ dev: false, dir: __dirname });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  createServer((req, res) => handle(req, res)).listen(process.env.PORT || 3000);
});
