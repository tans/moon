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
      (SELECT cost_usd FROM cost_stats WHERE user_id = ue.user_id AND date = date(ue.created_at))
    ) as cost
    FROM usage_events ue
    WHERE ue.user_id = ? AND date(ue.created_at) = date(?)
    GROUP BY ue.tier
  `).all(userId, today) as Array<{ tier: string; count: number; cost: number }>;

  const map: Record<string, { count: number; costUSD: number }> = {};
  for (const r of results) {
    map[r.tier] = { count: r.count, costUSD: r.cost ?? 0 };
  }
  return map;
}

// Tier weights for quota calculation
// Full Moon requests count most heavily, New Moon lightest
export const TIER_WEIGHTS: Record<string, number> = {
  '🌕': 1.0,
  '🌓': 0.5,
  '🌑': 0.25,
};

// Get usage limits for a user based on their plan
export interface UsageLimits {
  fullMoon: { limit: number; used: number };
  halfMoon: { limit: number; used: number };
  newMoon: { limit: number; used: number };
}

// Free trial configuration for new users
const FREE_TRIAL_LIMITS: UsageLimits = {
  fullMoon: { limit: 5, used: 0 },   // 5 advanced model requests
  halfMoon: { limit: 20, used: 0 },  // 20 medium tier requests
  newMoon: { limit: Infinity, used: 0 },  // unlimited light requests
};

// Get usage counts for a date range
function getUsageByDateRange(userId: string, startDate: string, endDate: string): { fullMoon: number; halfMoon: number; newMoon: number } {
  const usage = db.query(`
    SELECT tier, COUNT(*) as count
    FROM usage_events
    WHERE user_id = ? AND date(created_at) >= date(?) AND date(created_at) <= date(?)
    GROUP BY tier
  `).all(userId, startDate, endDate) as Array<{ tier: string; count: number }>;

  const usageMap: Record<string, number> = {};
  for (const u of usage) {
    usageMap[u.tier] = u.count;
  }

  return {
    fullMoon: usageMap['🌕'] ?? 0,
    halfMoon: usageMap['🌓'] ?? 0,
    newMoon: usageMap['🌑'] ?? 0,
  };
}

// Get usage counts for today
function getTodayUsage(userId: string): { fullMoon: number; halfMoon: number; newMoon: number } {
  const today = new Date().toISOString().split('T')[0];
  return getUsageByDateRange(userId, today, today);
}

// Get usage counts for this week (Monday to today)
function getWeekUsage(userId: string): { fullMoon: number; halfMoon: number; newMoon: number } {
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayOffset);
  const startOfWeek = monday.toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  return getUsageByDateRange(userId, startOfWeek, today);
}

// Get usage counts for this month (1st to today)
function getMonthUsage(userId: string): { fullMoon: number; halfMoon: number; newMoon: number } {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const today = now.toISOString().split('T')[0];
  return getUsageByDateRange(userId, startOfMonth, today);
}

export function getUserUsageLimits(userId: string): UsageLimits {
  // Get user's subscription plan
  const sub = db.query(
    'SELECT plan FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active') as { plan: string } | undefined;

  // Get today's usage
  const usage = getTodayUsage(userId);

  // If user has an active subscription, use plan limits
  if (sub) {
    const limits: Record<string, UsageLimits> = {
      '入门': {
        fullMoon: { limit: 30, used: usage.fullMoon },
        halfMoon: { limit: 200, used: usage.halfMoon },
        newMoon: { limit: Infinity, used: usage.newMoon },
      },
      '普通': {
        fullMoon: { limit: 200, used: usage.fullMoon },
        halfMoon: { limit: 1000, used: usage.halfMoon },
        newMoon: { limit: Infinity, used: usage.newMoon },
      },
      '高级': {
        fullMoon: { limit: 1000, used: usage.fullMoon },
        halfMoon: { limit: 5000, used: usage.halfMoon },
        newMoon: { limit: Infinity, used: usage.newMoon },
      },
    };
    return limits[sub.plan];
  }

  // For unsubscribed users, check if they have used their free trial
  const user = db.query(
    'SELECT has_used_free_trial FROM users WHERE id = ?'
  ).get(userId) as { has_used_free_trial: number } | undefined;

  // If user has used free trial or doesn't exist in users table, return zero limits
  if (!user || user.has_used_free_trial === 1) {
    return {
      fullMoon: { limit: 0, used: 0 },
      halfMoon: { limit: 0, used: 0 },
      newMoon: { limit: Infinity, used: 0 },
    };
  }

  // Provide free trial limits for new users who haven't used it yet
  return {
    fullMoon: { limit: FREE_TRIAL_LIMITS.fullMoon.limit, used: usage.fullMoon },
    halfMoon: { limit: FREE_TRIAL_LIMITS.halfMoon.limit, used: usage.halfMoon },
    newMoon: { limit: Infinity, used: usage.newMoon },
  };
}

// Check if user has quota for a tier
export function hasQuota(userId: string, tier: '🌕' | '🌓' | '🌑'): boolean {
  const limits = getUserUsageLimits(userId);
  const tierLimits = limits[tier === '🌕' ? 'fullMoon' : tier === '🌓' ? 'halfMoon' : 'newMoon'];
  return tierLimits.used < tierLimits.limit;
}

// Check if user's subscription is expired
export function isSubscriptionExpired(userId: string): boolean {
  const sub = db.query(
    'SELECT expires_at FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active') as { expires_at: string | null } | undefined;

  if (!sub || !sub.expires_at) {
    return false; // No expiration set, never expires
  }

  const now = new Date();
  const expiresAt = new Date(sub.expires_at);
  return now > expiresAt;
}

// Get expiration warning message
export function getExpirationWarning(userId: string): string | null {
  const sub = db.query(
    'SELECT expires_at FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active') as { expires_at: string | null } | undefined;

  if (!sub || !sub.expires_at) {
    return null;
  }

  const now = new Date();
  const expiresAt = new Date(sub.expires_at);

  if (now > expiresAt) {
    return '您的套餐已过期，请续费以继续使用服务。';
  }

  // Calculate days until expiration
  const daysLeft = Math.ceil((expiresAt.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (daysLeft <= 7) {
    return `您的套餐将于 ${daysLeft} 天后过期，请及时续费。`;
  }

  return null;
}

// Record a usage event
export function recordUsageEvent(userId: string, tier: string, modelName: string): void {
  const id = crypto.randomUUID().replace(/-/g, '').slice(0, 16);
  db.query(
    'INSERT INTO usage_events (id, user_id, tier, model_name) VALUES (?, ?, ?, ?)'
  ).run(id, userId, tier, modelName);

  // Mark free trial as used if user has started using their free quota
  const user = db.query(
    'SELECT has_used_free_trial FROM users WHERE id = ?'
  ).get(userId) as { has_used_free_trial: number } | undefined;

  if (user && user.has_used_free_trial === 0) {
    // Check if user has active subscription
    const sub = db.query(
      'SELECT plan FROM subscriptions WHERE user_id = ? AND status = ?'
    ).get(userId, 'active') as { plan: string } | undefined;

    // Only mark free trial as used if user doesn't have a subscription
    if (!sub) {
      db.query(
        'UPDATE users SET has_used_free_trial = 1 WHERE id = ?'
      ).run(userId);
    }
  }
}

// Check if user is on free trial (no subscription but hasn't exhausted free trial)
export function isOnFreeTrial(userId: string): boolean {
  const sub = db.query(
    'SELECT plan FROM subscriptions WHERE user_id = ? AND status = ?'
  ).get(userId, 'active') as { plan: string } | undefined;

  if (sub) return false; // Has subscription, not on free trial

  const user = db.query(
    'SELECT has_used_free_trial FROM users WHERE id = ?'
  ).get(userId) as { has_used_free_trial: number } | undefined;

  return user !== undefined && user.has_used_free_trial === 0;
}

// Get free trial message if user has no quota and is on free trial
export function getFreeTrialMessage(limits: UsageLimits): string | null {
  // If all real limits are exhausted, suggest purchasing
  if (limits.fullMoon.limit === 0 && limits.halfMoon.limit === 0) {
    return '您还没有订阅套餐，请先购买套餐以继续使用服务。';
  }
  return null;
}

// Update API key last_used_at timestamp
export function updateApiKeyLastUsed(userId: string): void {
  db.query(
    'UPDATE api_keys SET last_used_at = CURRENT_TIMESTAMP WHERE user_id = ? AND is_active = 1'
  ).run(userId);
}

// Usage period types
export type UsagePeriod = 'today' | 'week' | 'month';

export interface UsageStats {
  today: { fullMoon: number; halfMoon: number; newMoon: number };
  week: { fullMoon: number; halfMoon: number; newMoon: number };
  month: { fullMoon: number; halfMoon: number; newMoon: number };
}

// Get all usage stats for a user
export function getAllUsageStats(userId: string): UsageStats {
  return {
    today: getTodayUsage(userId),
    week: getWeekUsage(userId),
    month: getMonthUsage(userId),
  };
}

// Get quota warning level based on usage percentage
export type QuotaWarningLevel = 'none' | 'low' | 'medium' | 'high' | 'exceeded';

export interface QuotaWarning {
  level: QuotaWarningLevel;
  message: string;
  tier: 'fullMoon' | 'halfMoon';
  used: number;
  limit: number;
  percentage: number;
}

// Check quota status and return warning if approaching or exceeded
export function getQuotaWarning(userId: string): QuotaWarning[] {
  const warnings: QuotaWarning[] = [];
  const limits = getUserUsageLimits(userId);

  // Check fullMoon quota
  if (limits.fullMoon.limit > 0) {
    const percentage = (limits.fullMoon.used / limits.fullMoon.limit) * 100;
    if (percentage >= 100) {
      warnings.push({
        level: 'exceeded',
        message: '🌕 高级模型额度已用完',
        tier: 'fullMoon',
        used: limits.fullMoon.used,
        limit: limits.fullMoon.limit,
        percentage,
      });
    } else if (percentage >= 90) {
      warnings.push({
        level: 'high',
        message: '🌕 高级模型额度即将用完（' + (limits.fullMoon.limit - limits.fullMoon.used) + '次剩余）',
        tier: 'fullMoon',
        used: limits.fullMoon.used,
        limit: limits.fullMoon.limit,
        percentage,
      });
    } else if (percentage >= 70) {
      warnings.push({
        level: 'medium',
        message: '🌕 高级模型额度已使用70%以上',
        tier: 'fullMoon',
        used: limits.fullMoon.used,
        limit: limits.fullMoon.limit,
        percentage,
      });
    }
  }

  // Check halfMoon quota
  if (limits.halfMoon.limit > 0) {
    const percentage = (limits.halfMoon.used / limits.halfMoon.limit) * 100;
    if (percentage >= 100) {
      warnings.push({
        level: 'exceeded',
        message: '🌓 中级模型额度已用完',
        tier: 'halfMoon',
        used: limits.halfMoon.used,
        limit: limits.halfMoon.limit,
        percentage,
      });
    } else if (percentage >= 90) {
      warnings.push({
        level: 'high',
        message: '🌓 中级模型额度即将用完（' + (limits.halfMoon.limit - limits.halfMoon.used) + '次剩余）',
        tier: 'halfMoon',
        used: limits.halfMoon.used,
        limit: limits.halfMoon.limit,
        percentage,
      });
    }
  }

  return warnings;
}