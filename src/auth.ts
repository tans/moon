import { db } from "./db";

export interface AuthResult {
  userId: string;
  tier: "L1" | "L2" | "L3";
}

export function authenticate(authHeader: string | null): AuthResult | null {
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return null;
  }

  const key = authHeader.slice(7);
  const row = db.query("SELECT user_id, tier FROM api_keys WHERE key = ?").get(key) as { user_id: string; tier: string } | undefined;

  if (!row) {
    return null;
  }

  return { userId: row.user_id, tier: row.tier as "L1" | "L2" | "L3" };
}

export function createApiKey(userId: string, tier: "L1" | "L2" | "L3"): string {
  const id = crypto.randomUUID();
  const key = `moon_${Buffer.from(crypto.getRandomValues(new Uint8Array(16))).toString("hex")}`;

  db.query("INSERT INTO api_keys (id, user_id, key, tier) VALUES (?, ?, ?, ?)").run(id, userId, key, tier);

  return key;
}