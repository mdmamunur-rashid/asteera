import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const root = process.cwd();
const tarPath = path.join(root, "next-build.tar.gz");
if (fs.existsSync(tarPath)) {
  execFileSync("tar", ["-xzf", tarPath, "-C", root], { stdio: "inherit" });
  console.log("Extracted .next build.");
}

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sqlFiles = ["0000_init_clean.sql", "0001_phase2.sql"];
const conn = await mysql.createConnection(url);
try {
  let count = 0;
  for (const file of sqlFiles) {
    const p = path.join(root, "drizzle", file);
    if (!fs.existsSync(p)) continue;
    const sqlText = fs.readFileSync(p, "utf8");
    const statements = sqlText.split(/;\s*/).map((s) => s.trim()).filter(Boolean);
    for (const stmt of statements) {
      count++;
      try {
        await conn.query(stmt);
      } catch (err) {
        const code = err?.errno;
        // Ignore already-exists errors (table, column, index, duplicate row)
        if (code === 1050 || code === 1060 || code === 1061 || code === 1062) continue;
        throw err;
      }
    }
  }
  console.log(`Database initialized (${count} statements checked).`);
} finally {
  await conn.end();
}
