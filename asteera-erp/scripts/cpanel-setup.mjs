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

const sqlText = fs.readFileSync(path.join(root, "drizzle", "0000_init_clean.sql"), "utf8");
const statements = sqlText.split(/;\s*\r?\n/).map((s) => s.trim()).filter(Boolean);

const conn = await mysql.createConnection(url);
try {
  for (const stmt of statements) {
    try {
      await conn.query(stmt);
    } catch (err) {
      const code = err?.errno;
      if (code === 1050 || code === 1061 || code === 1062) continue;
      throw err;
    }
  }
  console.log(`Database initialized (${statements.length} statements checked).`);
} finally {
  await conn.end();
}
