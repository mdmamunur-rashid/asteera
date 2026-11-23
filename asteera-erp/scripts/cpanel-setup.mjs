import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const root = process.cwd();
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const sqlFiles = ["0000_init_clean.sql", "0001_phase2.sql", "0002_product_images.sql", "0003_utf8mb4.sql", "0004_dup_accepted.sql", "0005_buyer_modules.sql"];
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

  const prodPath = path.join(root, "scripts", "sheet-products.json");
  if (fs.existsSync(prodPath)) {
    const products = JSON.parse(fs.readFileSync(prodPath, "utf8"));
    let upserted = 0;
    for (const p of products) {
      if (!p.sku) continue;
      await conn.execute(
        `INSERT INTO items (sku, name, size, type, category, sale_price, image_url)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           name = COALESCE(NULLIF(?, ''), name),
           size = COALESCE(NULLIF(?, ''), size),
           type = COALESCE(NULLIF(?, ''), type),
           category = COALESCE(NULLIF(?, ''), category),
           sale_price = IF(? > 0, ?, sale_price),
           image_url = COALESCE(NULLIF(?, ''), image_url)`,
        [
          p.sku, p.name || p.sku, p.size || "", p.page || "", p.page || "", Number(p.price) || 0, p.imageUrl || "",
          p.name || "", p.size || "", p.page || "", p.page || "", Number(p.price) || 0, Number(p.price) || 0, p.imageUrl || "",
        ]
      );
      upserted++;
    }
    console.log(`Upserted ${upserted} products from sheet-products.json.`);
  }
} finally {
  await conn.end();
}
