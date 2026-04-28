import { db } from "../db";
import { sendExpirationReminderEmail } from "./email";
import { getUserUsageLimits, TIER_WEIGHTS } from "./cost";

const REMINDER_DAYS = [7, 3, 1];

interface SubscriptionWithUser {
  user_id: string;
  email: string;
  plan: string;
  expires_at: string;
  status: string;
}

/**
 * Get all active subscriptions with user email that are expiring soon
 */
function getExpiringSubscriptions(): SubscriptionWithUser[] {
  const results = db.query(`
    SELECT s.user_id, u.email, s.plan, s.expires_at, s.status
    FROM subscriptions s
    JOIN users u ON s.user_id = u.id
    WHERE s.status = 'active' AND s.expires_at IS NOT NULL
  `).all() as SubscriptionWithUser[];

  return results;
}

/**
 * Check if a reminder was already sent for a specific user and days_before_expiration
 */
function wasReminderSent(userId: string, daysBeforeExpiration: number): boolean {
  const reminder = db.query(`
    SELECT id FROM subscription_reminders
    WHERE user_id = ? AND days_before_expiration = ?
  `).get(userId, daysBeforeExpiration);

  return !!reminder;
}

/**
 * Record that a reminder was sent
 */
function recordReminderSent(
  userId: string,
  email: string,
  daysBeforeExpiration: number,
  remindAt: string,
  unsubscribeToken: string
): void {
  const id = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  db.query(`
    INSERT INTO subscription_reminders (id, user_id, email, remind_at, days_before_expiration, unsubscribe_token)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, userId, email, remindAt, daysBeforeExpiration, unsubscribeToken);
}

/**
 * Calculate days until expiration
 */
function getDaysUntilExpiration(expiresAt: string): number {
  const now = new Date();
  const expiresDate = new Date(expiresAt);
  const diffMs = expiresDate.getTime() - now.getTime();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Send subscription expiration reminders
 * This should be called periodically (e.g., every hour or every day)
 */
export async function checkAndSendExpirationReminders(): Promise<{
  checked: number;
  sent: number;
  errors: number;
}> {
  const subscriptions = getExpiringSubscriptions();
  let sent = 0;
  let errors = 0;

  for (const sub of subscriptions) {
    const daysLeft = getDaysUntilExpiration(sub.expires_at);

    // Skip if already expired (more than 0 days left means not yet expired)
    if (daysLeft < 0) {
      continue;
    }

    // Check if we need to send a reminder for this subscription
    for (const reminderDay of REMINDER_DAYS) {
      if (daysLeft === reminderDay && !wasReminderSent(sub.user_id, reminderDay)) {
        try {
          const renewalUrl = "https://moon.ai/order/select";
          const unsubscribeToken = crypto.randomUUID().replace(/-/g, "").slice(0, 16);

          // Get user's current usage information
          const usageLimits = getUserUsageLimits(sub.user_id);
          const usagePercent = usageLimits.fullMoon.limit === Infinity ? 0 :
            Math.round((usageLimits.fullMoon.used / usageLimits.fullMoon.limit) * 100);

          const success = await sendExpirationReminderEmail({
            email: sub.email,
            plan: sub.plan,
            expiresAt: sub.expires_at,
            daysLeft,
            renewalUrl,
            usageInfo: {
              fullMoonUsed: usageLimits.fullMoon.used,
              fullMoonLimit: usageLimits.fullMoon.limit,
              usagePercent,
            },
            unsubscribeUrl: `https://moon.ai/unsubscribe/${unsubscribeToken}`,
          });

          if (success) {
            // Record the sent reminder
            const remindAt = new Date().toISOString();
            recordReminderSent(sub.user_id, sub.email, reminderDay, remindAt, unsubscribeToken);
            sent++;
            console.log(
              `Sent ${reminderDay}-day expiration reminder to ${sub.email} (plan: ${sub.plan})`
            );
          } else {
            errors++;
          }
        } catch (err) {
          console.error(`Failed to send reminder to ${sub.email}:`, err);
          errors++;
        }
      }
    }
  }

  return {
    checked: subscriptions.length,
    sent,
    errors,
  };
}

/**
 * Start the subscription reminder background job
 * Runs every hour
 */
let reminderIntervalId: Timer | null = null;

export function startExpirationReminderJob(): void {
  if (reminderIntervalId) {
    return; // Already running
  }

  console.log("Starting subscription expiration reminder job...");

  // Run immediately on start
  checkAndSendExpirationReminders().catch((err) => {
    console.error("Initial reminder check failed:", err);
  });

  // Then run every hour
  reminderIntervalId = setInterval(
    () => {
      checkAndSendExpirationReminders()
        .then((result) => {
          if (result.sent > 0) {
            console.log(
              `Reminder job completed: checked ${result.checked}, sent ${result.sent}, errors ${result.errors}`
            );
          }
        })
        .catch((err) => {
          console.error("Reminder job failed:", err);
        });
    },
    60 * 60 * 1000 // 1 hour
  );
}

export function stopExpirationReminderJob(): void {
  if (reminderIntervalId) {
    clearInterval(reminderIntervalId);
    reminderIntervalId = null;
    console.log("Stopped subscription expiration reminder job");
  }
}