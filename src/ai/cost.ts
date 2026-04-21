import { db } from '../db';

export interface CostRecord {
  userId: string;
  date: string; // YYYY-MM-DD format
  inputTokens: number;
  outputTokens: number;
  costUSD: number;
  requestCount: number;
}

// Record usage and cost for a user
export function recordUsage(
  userId: string,
  inputTokens: number,
  outputTokens: number,
  costUSD: number
): void {
  const today = new Date().toISOString().split('T')[0];

  // Try to update existing record
  const existing = db.query(
    'SELECT id, input_tokens, output_tokens, cost_usd, request_count FROM cost_stats WHERE user_id = ? AND date = ?'
  ).get(userId, today) as { id: string; input_tokens: number; output_tokens: number; cost_usd: number; request_count: number } | undefined;

  if (existing) {
    db.query(`
      UPDATE cost_stats
      SET input_tokens = input_tokens + ?,
          output_tokens = output_tokens + ?,
          cost_usd = cost_usd + ?,
          request_count = request_count + 1
      WHERE id = ?
    `).run(inputTokens, outputTokens, costUSD, existing.id);
  } else {
    const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    db.query(`
      INSERT INTO cost_stats (id, user_id, date, input_tokens, output_tokens, cost_usd, request_count)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(id, userId, today, inputTokens, outputTokens, costUSD, 1);
  }
}

// Get user's cost stats for a date range
export function getCostStats(userId: string, days: number = 30): CostRecord[] {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - days);
  const startDateStr = startDate.toISOString().split('T')[0];

  const results = db.query(`
    SELECT user_id, date, input_tokens, output_tokens, cost_usd, request_count
    FROM cost_stats
    WHERE user_id = ? AND date >= ?
    ORDER BY date DESC
  `).all(userId, startDateStr) as Array<{
    user_id: string;
    date: string;
    input_tokens: number;
    output_tokens: number;
    cost_usd: number;
    request_count: number;
  }>;

  return results.map(r => ({
    userId: r.user_id,
    date: r.date,
    inputTokens: r.input_tokens,
    outputTokens: r.output_tokens,
    costUSD: r.cost_usd,
    requestCount: r.request_count,
  }));
}

// Get today's usage for a user by tier
export function getTodayUsageByTier(userId: string): Record<string, { count: number; costUSD: number }> {
  const today = new Date().toISOString().split('T')[0];

  const results = db.query(`
    SELECT ue.tier, COUNT(*) as count, SUM(
      (SELECT cost_usd FROM cost_stats WHERE user_id = ue.user_id AND date = ue.date)
    ) as cost
    FROM usage_events ue
    WHERE ue.user_id = ? AND ue.date(ue.created_at) = date(?)
    GROUP BY ue.tier
  `).all(userId, today) as Array<{ tier: string; count: number; cost: number }>;

  const map: Record<string, { count: number; costUSD: number }> = {};
  for (const r of results) {
    map[r.tier] = { count: r.count, costUSD: r.cost ?? 0 };
  }
  return map;
}

// Get usage limits for a user based on their plan
export interface UsageLimits {
  fullMoon: { limit: number; used: number };
  halfMoon: { limit: number; used: number };
  newMoon: { limit: number; used: number };
}

export function getUserUsageLimits(userId: string): UsageLimits {
  // Get user's subscription plan
  const sub = db.query(
    'SELECT plan FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active') as { plan: string } | undefined;

  // Default limits based on plan
  const limits: Record<string, UsageLimits> = {
    '入门': {
      fullMoon: { limit: 30, used: 0 },
      halfMoon: { limit: 200, used: 0 },
      newMoon: { limit: Infinity, used: 0 },
    },
    '普通': {
      fullMoon: { limit: 200, used: 0 },
      halfMoon: { limit: 1000, used: 0 },
      newMoon: { limit: Infinity, used: 0 },
    },
    '高级': {
      fullMoon: { limit: 1000, used: 0 },
      halfMoon: { limit: 5000, used: 0 },
      newMoon: { limit: Infinity, used: 0 },
    },
  };

  const planLimits = limits[sub?.plan ?? '入门'];

  // Get today's usage
  const today = new Date().toISOString().split('T')[0];
  const usage = db.query(`
    SELECT tier, COUNT(*) as count
    FROM usage_events
    WHERE user_id = ? AND date(created_at) = date(?)
    GROUP BY tier
  `).all(userId, today) as Array<{ tier: string; count: number }>;

  const usageMap: Record<string, number> = {};
  for (const u of usage) {
    usageMap[u.tier] = u.count;
  }

  return {
    fullMoon: { ...planLimits.fullMoon, used: usageMap['🌕'] ?? 0 },
    halfMoon: { ...planLimits.halfMoon, used: usageMap['🌓'] ?? 0 },
    newMoon: { ...planLimits.newMoon, used: usageMap['🌑'] ?? 0 },
  };
}

// Check if user has quota for a tier
export function hasQuota(userId: string, tier: '🌕' | '🌓' | '🌑'): boolean {
  const limits = getUserUsageLimits(userId);
  const tierLimits = limits[tier === '🌕' ? 'fullMoon' : tier === '🌓' ? 'halfMoon' : 'newMoon'];
  return tierLimits.used < tierLimits.limit;
}

// Record a usage event
export function recordUsageEvent(userId: string, tier: string, modelName: string): void {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  db.query(
    'INSERT INTO usage_events (id, user_id, tier, model_name) VALUES (?, ?, ?, ?)'
  ).run(id, userId, tier, modelName);
}