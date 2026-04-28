import { getConfig } from "../config";

export interface EmailOptions {
  to: string;
  subject: string;
  html: string;
}

/**
 * Send an email using SMTP configuration from config
 */
export async function sendEmail(options: EmailOptions): Promise<boolean> {
  const config = getConfig();

  if (!config.smtp) {
    console.warn("SMTP not configured, skipping email send:", options.subject);
    return false;
  }

  const { host, port, user, pass, from } = config.smtp;

  try {
    // Using Bun's native SMTP support
    const response = await fetch(`smtp://${user}:${pass}@${host}:${port}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: options.to,
        subject: options.subject,
        html: options.html,
      }),
    });

    if (!response.ok) {
      console.error("Failed to send email:", await response.text());
      return false;
    }

    return true;
  } catch (err) {
    console.error("Email send error:", err);
    return false;
  }
}

/**
 * Send subscription expiration reminder email
 */
export async function sendExpirationReminderEmail(params: {
  email: string;
  plan: string;
  expiresAt: string;
  daysLeft: number;
  renewalUrl: string;
  usageInfo?: {
    fullMoonUsed: number;
    fullMoonLimit: number;
    usagePercent: number;
  };
  unsubscribeUrl?: string;
}): Promise<boolean> {
  const { email, plan, expiresAt, daysLeft, renewalUrl, usageInfo, unsubscribeUrl } = params;

  const subject = daysLeft > 0
    ? `您的${plan}套餐将于${daysLeft}天后过期`
    : `您的${plan}套餐已过期`;

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #f5f5dc; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #2d2d2d; border-radius: 12px; padding: 30px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; margin-bottom: 10px; }
    .content { line-height: 1.8; }
    .highlight { color: #f5f5dc; font-weight: bold; }
    .cta { display: inline-block; background: #f5f5dc; color: #1a1a1a; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-weight: bold; }
    .warning { color: #ff6b6b; }
    .footer { margin-top: 30px; text-align: center; color: #888; font-size: 12px; }
    .usage-box { background: #1a1a2d; border: 1px solid #3d3d5c; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .usage-bar { height: 8px; background: #3d3d5c; border-radius: 4px; margin-top: 8px; }
    .usage-fill { height: 100%; background: #f5f5dc; border-radius: 4px; transition: width 0.3s; }
    .plan-compare { background: #1a2d1a; border: 1px solid #2d5c2d; border-radius: 8px; padding: 15px; margin: 15px 0; }
    .unsubscribe { color: #888; font-size: 11px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌕 MOON</div>
      <h2>套餐到期提醒</h2>
    </div>
    <div class="content">
      <p>您好，</p>
      <p>我们提醒您：</p>
      <ul>
        <li><span class="highlight">当前套餐：</span>${plan}</li>
        <li><span class="highlight">到期日期：</span>${formatDate(expiresAt)}</li>
        ${
          daysLeft > 0
            ? `<li class="warning"><span class="highlight">剩余天数：</span>${daysLeft} 天</li>`
            : `<li class="warning"><span class="highlight">状态：</span>已过期</li>`
        }
      </ul>
      ${
        usageInfo && usageInfo.fullMoonLimit !== Infinity
          ? `
      <div class="usage-box">
        <p><span class="highlight">今日用量：</span></p>
        <p>🌕 满月配额：已用 ${usageInfo.fullMoonUsed} / ${usageInfo.fullMoonLimit} (${usageInfo.usagePercent}%)</p>
        <div class="usage-bar"><div class="usage-fill" style="width: ${Math.min(usageInfo.usagePercent, 100)}%"></div></div>
      </div>
      `
          : ''
      }
      <div class="plan-compare">
        <p><span class="highlight">套餐升级推荐：</span></p>
        <ul>
          <li>🌕 <strong>高级套餐</strong> - 每月1000次满月配额，适合高强度使用</li>
          <li>🌓 <strong>普通套餐</strong> - 每月200次满月配额</li>
          <li>🌒 <strong>入门套餐</strong> - 每月30次满月配额</li>
        </ul>
      </div>
      ${
        daysLeft > 0
          ? `<p>为确保服务不中断，请及时续费：</p>`
          : `<p>您的服务已中断，请立即续费以恢复使用：</p>`
      }
      <p style="text-align: center;">
        <a href="${renewalUrl}" class="cta">立即续费 →</a>
      </p>
      ${
        unsubscribeUrl
          ? `<p class="unsubscribe"><a href="${unsubscribeUrl}" style="color: #888;">退订提醒邮件</a></p>`
          : ''
      }
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复。</p>
      <p>如有问题，请联系客服。</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html });
}

/**
 * Send subscription activation confirmation email
 */
export async function sendSubscriptionActivationEmail(
  email: string,
  plan: string,
  billingCycle: string,
  expiresAt: string
): Promise<boolean> {
  const cycleLabel = billingCycle === 'yearly' ? '年度' : '月度';

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("zh-CN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  };

  const subject = `您的 MOON ${plan} 套餐已成功激活`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #1a1a1a; color: #f5f5dc; padding: 20px; }
    .container { max-width: 600px; margin: 0 auto; background: #2d2d2d; border-radius: 12px; padding: 30px; }
    .header { text-align: center; margin-bottom: 30px; }
    .logo { font-size: 24px; margin-bottom: 10px; }
    .content { line-height: 1.8; }
    .highlight { color: #f5f5dc; font-weight: bold; }
    .success-box { background: #1a3a1a; border: 1px solid #2d5a2d; border-radius: 8px; padding: 20px; margin: 20px 0; }
    .feature-list { list-style: none; padding: 0; }
    .feature-list li { padding: 8px 0; }
    .cta { display: inline-block; background: #f5f5dc; color: #1a1a1a; padding: 12px 24px; border-radius: 8px; text-decoration: none; margin-top: 20px; font-weight: bold; }
    .footer { margin-top: 30px; text-align: center; color: #888; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">🌕 MOON</div>
      <h2>订阅激活成功</h2>
    </div>
    <div class="content">
      <p>您好，</p>
      <p>感谢您的支持！您的 MOON 订阅已成功激活。</p>

      <div class="success-box">
        <ul class="feature-list">
          <li>✓ <span class="highlight">套餐：</span>${plan} · ${cycleLabel}</li>
          <li>✓ <span class="highlight">到期时间：</span>${formatDate(expiresAt)}</li>
          <li>✓ <span class="highlight">状态：</span>已激活</li>
        </ul>
      </div>

      <p>您现在可以：</p>
      <ul>
        <li>使用 🌕 满月高级模型（GPT-4o、Claude、Gemini）</li>
        <li>使用 🌓 半月高效模型（Kimi、MiniMax、Qwen）</li>
        <li>无限使用 🌒 新月轻量模型</li>
      </ul>

      <p style="text-align: center;">
        <a href="https://your-domain.com/dashboard" class="cta">前往后台 →</a>
      </p>
    </div>
    <div class="footer">
      <p>此邮件由系统自动发送，请勿回复。</p>
      <p>如有问题，请联系客服。</p>
    </div>
  </div>
</body>
</html>
`;

  return sendEmail({ to: email, subject, html });
}