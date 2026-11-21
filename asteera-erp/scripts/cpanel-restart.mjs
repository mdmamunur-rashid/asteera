import fs from "node:fs";
import path from "node:path";

const self = process.pid;
const parent = process.ppid;
let killed = 0;

for (const entry of fs.readdirSync("/proc")) {
  if (!/^\d+$/.test(entry)) continue;
  const pid = Number(entry);
  if (pid === self || pid === parent) continue;
  try {
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").replace(/\0/g, " ");
    if (cmd.includes("asteera-erp") && (cmd.includes("lsnode") || cmd.includes("server.js"))) {
      process.kill(pid, "SIGKILL");
      console.log(`Killed stale worker PID ${pid}: ${cmd.trim()}`);
      killed++;
    }
  } catch {
    /* ignore processes we don't own or that exited */
  }
}

const tmpDir = path.join(process.cwd(), "tmp");
fs.mkdirSync(tmpDir, { recursive: true });
fs.writeFileSync(path.join(tmpDir, "restart.txt"), String(Date.now()));
console.log(`Done. Killed ${killed} stale worker(s) and touched tmp/restart.txt.`);
