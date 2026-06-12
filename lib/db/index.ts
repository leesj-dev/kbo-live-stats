import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "./schema";

type Db = ReturnType<typeof drizzle<typeof schema>>;

let cached: Db | null = null;

export function hasDb(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

// Lazily create the Drizzle client so the app can run in snapshot mode
// (no DATABASE_URL) without throwing at import time.
export function getDb(): Db {
  if (cached) return cached;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("DATABASE_URL is not set");
  cached = drizzle(neon(connectionString), { schema });
  return cached;
}

export { schema };
