import { drizzle } from "drizzle-orm/mysql2";
import mysql from "mysql2/promise";
import * as schema from "./schema";

const g = globalThis as unknown as { __pool?: mysql.Pool };

// createPool is lazy: no connection is opened until the first query,
// so `next build` works without a database.
const pool =
  g.__pool ??
  mysql.createPool({
    uri: process.env.DATABASE_URL ?? "mysql://user:pass@localhost:3306/db",
    connectionLimit: 5,
    dateStrings: true,
  });
if (process.env.NODE_ENV !== "production") g.__pool = pool;

export const db = drizzle(pool, { schema, mode: "default" });
export { schema };
