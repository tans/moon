import { Hono } from "hono";
import { db } from "./db";

const plans = [
  {
    name: "入门",
    price: "¥9.9 / 月",
    fullMoon: "30 次 / 天",
    halfMoon: "200 次 / 天",
    newMoon: "不限",
  },
  {
    name: "普通",
    price: "¥39 / 月",
    fullMoon: "200 次 / 天",
    halfMoon: "1000 次 / 天",
    newMoon: "不限",
  },
  {
    name: "高级",
    price: "¥99 / 月",
    fullMoon: "1000 次 / 天",
    halfMoon: "5000 次 / 天",
    newMoon: "不限",
  },
] as const;

const modelTiers = [
  {
    tier: "满月",
    models: ["GPT", "Gemini", "Claude"],
    rule: "优先路由，额度按日计算",
  },
  {
    tier: "半月",
    models: ["Kimi", "MiniMax", "Qwen"],
    rule: "满月耗尽后降级",
  },
  {
    tier: "新月",
    models: ["轻量模型", "快速模型", "低成本模型"],
    rule: "始终可用",
  },
] as const;

const app = new Hono();

function moonPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="MOON - Model Always Online. 从满月到新月，始终在线。" />
    <title>MOON | Model Always Online</title>
    <style>
      :root {
        --bg: #fffaf5;
        --panel: rgba(255, 255, 255, 0.82);
        --text: #2b2333;
        --muted: #7f6f7d;
        --primary: #f08787;
        --accent: #ffc7a7;
        --line: #f0ddd3;
        --shadow: 0 20px 60px rgba(70, 40, 50, 0.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(240, 135, 135, 0.16), transparent 30%),
          radial-gradient(circle at top right, rgba(255, 199, 167, 0.26), transparent 28%),
          linear-gradient(180deg, #fffdf9 0%, var(--bg) 100%);
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 1160px; margin: 0 auto; padding: 24px; }
      .nav, .hero, .grid, .plans { display: grid; gap: 20px; }
      .nav {
        grid-template-columns: 1fr auto;
        align-items: center;
        margin-bottom: 48px;
      }
      .brand {
        display: flex; align-items: center; gap: 14px;
        font-weight: 700; letter-spacing: 0.04em;
      }
      .logo {
        width: 46px; height: 46px; border-radius: 999px;
        background: radial-gradient(circle at 30% 30%, #fff7eb, #f8d9cb 55%, #f08787 100%);
        box-shadow: inset 0 1px 2px rgba(255,255,255,.5);
        position: relative;
      }
      .logo::after {
        content: ""; position: absolute; inset: 11px 0 11px 18px;
        border-radius: 999px; background: rgba(255,255,255,.96);
      }
      .chip, .button, .card, .plan {
        border: 1px solid var(--line);
        background: var(--panel);
        box-shadow: var(--shadow);
        backdrop-filter: blur(16px);
      }
      .button {
        display: inline-flex; align-items: center; justify-content: center;
        padding: 12px 18px; border-radius: 999px; font-weight: 600;
      }
      .button.primary { background: var(--primary); color: #fff; border-color: transparent; }
      .hero {
        grid-template-columns: 1.15fr 0.85fr;
        align-items: center;
        padding: 28px 0 56px;
      }
      h1 {
        margin: 14px 0 16px;
        font-size: clamp(44px, 8vw, 86px);
        line-height: .95;
        letter-spacing: -0.05em;
      }
      .lead { font-size: 18px; line-height: 1.8; color: var(--muted); max-width: 620px; }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 28px; }
      .orb {
        min-height: 460px; border-radius: 36px; padding: 24px;
        display: grid; align-content: space-between;
        background:
          radial-gradient(circle at 30% 28%, rgba(255,255,255,.75), transparent 20%),
          linear-gradient(180deg, rgba(255,255,255,.7), rgba(255,255,255,.4));
      }
      .moon {
        width: 160px; height: 160px; border-radius: 50%; margin: 26px auto 0;
        background: radial-gradient(circle at 35% 30%, #fffef8, #ffe7c8 56%, #f3b9a7 100%);
        box-shadow: inset -28px 0 0 rgba(255,255,255,.94), inset 0 0 0 1px rgba(255,255,255,.5);
      }
      .mini { display: grid; gap: 12px; }
      .row { display: flex; justify-content: space-between; gap: 16px; align-items: center; }
      .card, .plan {
        border-radius: 28px; padding: 22px;
      }
      .grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .planGrid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
      .kicker { color: #b66f61; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
      .title { font-size: 22px; font-weight: 700; margin-top: 10px; }
      .muted { color: var(--muted); line-height: 1.7; }
      .pill {
        display: inline-flex; margin-top: 10px; padding: 8px 12px; border-radius: 999px;
        background: rgba(255,255,255,.66); border: 1px solid var(--line); font-size: 14px;
      }
      .section { margin-top: 24px; }
      .sectionHead { text-align: center; max-width: 760px; margin: 0 auto 28px; }
      .sectionHead h2 { font-size: 40px; margin: 8px 0 10px; letter-spacing: -.04em; }
      .plan.featured { background: linear-gradient(180deg, #f08787, #e86b6b); color: #fff; border-color: transparent; }
      .plan.featured .muted, .plan.featured .kicker { color: rgba(255,255,255,.88); }
      .price { font-size: 42px; font-weight: 800; margin: 10px 0 0; }
      .list { margin: 14px 0 0; padding: 0; list-style: none; display: grid; gap: 10px; }
      .list li::before { content: "•"; margin-right: 10px; color: var(--primary); }
      .plan.featured .list li::before { color: #fff; }
      @media (max-width: 920px) {
        .hero, .grid, .planGrid, .nav { grid-template-columns: 1fr; }
        .orb { min-height: 360px; }
        .sectionHead h2 { font-size: 32px; }
      }
    </style>
  </head>
  <body>
    <div class="wrap">
      <header class="nav">
        <div class="brand">
          <div class="logo" aria-hidden="true"></div>
          <div>
            <div style="font-size: 18px;">MOON</div>
            <div style="font-size: 12px; color: var(--muted); font-weight: 500;">Model Always Online</div>
          </div>
        </div>
        <a class="button primary" href="#plans">开始体验</a>
      </header>

      <section class="hero">
        <div>
          <div class="chip pill">从满月到新月，始终在线</div>
          <h1>大模型一直在线</h1>
          <p class="lead">
            MOON 统一聚合多模型，自动按“满月 / 半月 / 新月”路由。
            高层额度用完后自动降级，保证服务不断线。
          </p>
          <div class="actions">
            <a class="button primary" href="#plans">查看套餐</a>
            <a class="button" href="#tiers">查看模型层级</a>
          </div>
        </div>
        <div class="orb card">
          <div class="row">
            <div>
              <div class="kicker">当前状态</div>
              <div class="title">满月优先路由</div>
            </div>
            <div class="moon" aria-hidden="true"></div>
          </div>
          <div class="grid" style="margin-top: 18px;">
            <div class="card" style="padding: 16px;">
              <div class="kicker">满月</div>
              <div class="title" style="font-size: 18px;">复杂任务</div>
              <div class="muted" style="font-size: 14px;">编程、推理、长文本</div>
            </div>
            <div class="card" style="padding: 16px;">
              <div class="kicker">半月</div>
              <div class="title" style="font-size: 18px;">日常任务</div>
              <div class="muted" style="font-size: 14px;">总结、改写、翻译</div>
            </div>
            <div class="card" style="padding: 16px;">
              <div class="kicker">新月</div>
              <div class="title" style="font-size: 18px;">始终在线</div>
              <div class="muted" style="font-size: 14px;">聊天、续写、润色</div>
            </div>
          </div>
        </div>
      </section>

      <section class="section" id="tiers">
        <div class="sectionHead">
          <div class="kicker">模型层级</div>
          <h2>三层月相路由</h2>
          <p class="muted">从高优先级模型到基础模型，自动切换，用户无需理解复杂计费和接口。</p>
        </div>
        <div class="grid">
          ${modelTiers
            .map(
              (tier) => `
              <article class="card">
                <div class="kicker">${tier.tier}</div>
                <div class="title">${tier.models.join(" / ")}</div>
                <p class="muted">${tier.rule}</p>
              </article>
            `,
            )
            .join("")}
        </div>
      </section>

      <section class="section" id="plans">
        <div class="sectionHead">
          <div class="kicker">套餐</div>
          <h2>三档订阅</h2>
          <p class="muted">按使用量和优先级选择，后续可直接接入订阅与支付。</p>
        </div>
        <div class="planGrid">
          ${plans
            .map(
              (plan, index) => `
              <article class="plan ${index === 1 ? "featured" : ""}">
                <div class="kicker">${plan.name}</div>
                <div class="price">${plan.price}</div>
                <ul class="list">
                  <li>满月：${plan.fullMoon}</li>
                  <li>半月：${plan.halfMoon}</li>
                  <li>新月：${plan.newMoon}</li>
                </ul>
              </article>
            `,
            )
            .join("")}
        </div>
      </section>
    </div>
  </body>
</html>`;
}

app.get("/", (c) => c.html(moonPage()));

app.get("/health", (c) =>
  c.json({
    ok: true,
    database: "ready",
  }),
);

app.get("/api/plans", (c) => c.json(plans));

app.get("/api/moon", (c) =>
  c.json({
    routing: ["满月", "半月", "新月"],
    tiers: modelTiers,
  }),
);

app.get("/api/stats", (c) => {
  const userCount = db.query("SELECT COUNT(*) AS count FROM users").get() as { count: number };
  const subscriptionCount = db.query("SELECT COUNT(*) AS count FROM subscriptions").get() as { count: number };
  return c.json({
    users: userCount.count,
    subscriptions: subscriptionCount.count,
  });
});

export default app;
