import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const root = process.cwd();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sqlFiles = ["0000_init_clean.sql", "0001_phase2.sql", "0002_product_images.sql", "0003_utf8mb4.sql", "0004_dup_accepted.sql"];
const conn = await mysql.createConnection({ uri: url, charset: "utf8mb4" });
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
        if (code === 1050 || code === 1060 || code === 1061 || code === 1062) continue;
        throw err;
      }
    }
  }
  console.log(`Database initialized (${count} statements checked).`);
} finally {
  await conn.end();
}
