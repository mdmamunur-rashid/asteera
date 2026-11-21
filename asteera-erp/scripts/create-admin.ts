import bcrypt from "bcryptjs";
import { db, schema } from "../src/db";

// Usage: npm run create-admin -- "Name" email@example.com 'StrongPassword'
const [name, email, password] = process.argv.slice(2);
if (!name || !email || !password) {
  console.error("Usage: npm run create-admin -- <name> <email> <password>");
  process.exit(1);
}
if (password.length < 10) {
  console.error("Password must be at least 10 characters.");
  process.exit(1);
}

await db.insert(schema.users).values({ name, email, passwordHash: await bcrypt.hash(password, 12), role: "admin" });
console.log(`Admin ${email} created.`);
process.exit(0);
