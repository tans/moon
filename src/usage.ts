import { db } from "./db";

export interface UsageRecord {
  id: string;
  userId: string;
  tier: "L1" | "L2" | "L3";
  modelName: string;
  createdAt: Date;
}

export function recordUsage(
  userId: string,
  tier: "L1" | "L2" | "L3",
  modelName: string
): void {
  const id = crypto.randomUUID();
  db.query(
    "INSERT INTO usage_events (id, user_id, tier, model_name) VALUES (?, ?, ?, ?)"
  ).run(id, userId, tier, modelName);
}

export function getTodayUsage(userId: string, tier: "L1" | "L2" | "L3"): number {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const today = `${year}-${month}-${day}`;

  const row = db.query(
    "SELECT COUNT(*) as count FROM usage_events WHERE user_id = ? AND tier = ? AND date(created_at) = ?"
  ).get(userId, tier, today) as { count: number };

  return row?.count ?? 0;
}
