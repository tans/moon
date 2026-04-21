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
    tierEmoji: "🌕",
    models: ["GPT", "Gemini", "Claude"],
    rule: "优先路由，额度按日计算",
  },
  {
    tier: "半月",
    tierEmoji: "🌓",
    models: ["Kimi", "MiniMax", "Qwen"],
    rule: "满月耗尽后降级",
  },
  {
    tier: "新月",
    tierEmoji: "🌑",
    models: ["轻量模型", "快速模型", "低成本模型"],
    rule: "始终可用",
  },
] as const;

const app = new Hono();

function baseHtml(content: string) {
  return `<!doctype html>
<html lang="zh-CN" data-theme="coffee">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>MOON | Model Always Online</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/daisyui@5.0.9/dist/full.min.css" />
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
    </style>
  </head>
<<<<<<< HEAD
  <body class="bg-black text-[#f5f5dc] min-h-screen">
    ${content}
=======
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
        <div class="actions" style="margin-top: 0;">
          <a class="button" href="/login">登录</a>
          <a class="button primary" href="/register">注册</a>
        </div>
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
            <a class="button primary" href="/register">立即注册</a>
            <a class="button" href="#plans">查看套餐</a>
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
>>>>>>> origin/agent/claude-for-moon/2bd0d598
  </body>
</html>`;
}

function navbar(currentPath: string = "/") {
  return `
  <nav class="border-b border-[#3d2f1f] px-4 py-4">
    <div class="max-w-5xl mx-auto flex items-center justify-between">
      <a href="/" class="flex items-center gap-2 text-[#f5f5dc] hover:text-[#f5f5dc]">
        <span class="text-2xl">🌙</span>
        <span class="font-bold text-lg">MOON</span>
      </a>
      <div class="flex items-center gap-6 text-sm">
        <a href="/" class="hover:text-[#d4c4a8] ${currentPath === '/' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">首页</a>
        <a href="/pricing" class="hover:text-[#d4c4a8] ${currentPath === '/pricing' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">套餐</a>
        <a href="/dashboard" class="hover:text-[#d4c4a8] ${currentPath === '/dashboard' ? 'text-[#f5f5dc] font-semibold' : 'text-[#a0937d]'}">后台</a>
        <a href="/login" class="text-[#a0937d] hover:text-[#f5f5dc]">登录</a>
        <a href="/register" class="bg-[#f5f5dc] text-black px-4 py-2 rounded-full text-sm font-medium hover:bg-[#d4c4a8]">注册</a>
      </div>
    </div>
  </nav>`;
}

function footer() {
  return `
  <footer class="border-t border-[#3d2f1f] px-4 py-8 mt-16">
    <div class="max-w-5xl mx-auto text-center text-[#a0937d] text-sm">
      <p class="text-2xl mb-2">🌙</p>
      <p>MOON — Model Always Online</p>
      <p class="mt-1">从满月到新月，始终在线</p>
    </div>
  </footer>`;
}

function moonPage() {
  return baseHtml(`
    ${navbar('/')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <!-- Hero -->
      <section class="text-center py-16">
        <div class="text-6xl mb-6">🌙</div>
        <h1 class="text-4xl md:text-5xl font-bold text-[#f5f5dc] mb-4 tracking-tight">
          大模型一直在线
        </h1>
        <p class="text-[#a0937d] text-lg mb-2">🌕 满月 / 🌓 半月 / 🌑 新月</p>
        <p class="text-[#7a6f5d] max-w-xl mx-auto mb-8">
          优先使用满月模型，其次半月模型，新月不限。自动路由，始终在线。
        </p>
        <div class="flex gap-4 justify-center">
          <a href="/register" class="bg-[#f5f5dc] text-black px-6 py-3 rounded-full font-medium hover:bg-[#d4c4a8]">立即开始</a>
          <a href="/pricing" class="border border-[#f5f5dc] text-[#f5f5dc] px-6 py-3 rounded-full font-medium hover:bg-[#f5f5dc] hover:text-black">查看套餐</a>
        </div>
      </section>

      <!-- Tiers -->
      <section class="py-12">
        <h2 class="text-center text-[#f5f5dc] text-2xl font-bold mb-8">三层月相路由 🌙</h2>
        <div class="grid md:grid-cols-3 gap-6">
          ${modelTiers.map(tier => `
            <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 text-center">
              <div class="text-4xl mb-4">${tier.tierEmoji}</div>
              <h3 class="text-[#f5f5dc] text-xl font-bold mb-2">${tier.tier}</h3>
              <div class="text-[#a0937d] text-sm mb-3">${tier.models.join(' / ')}</div>
              <p class="text-[#7a6f5d] text-xs">${tier.rule}</p>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- How it works -->
      <section class="py-12">
        <h2 class="text-center text-[#f5f5dc] text-2xl font-bold mb-8">工作原理 ⚡</h2>
        <div class="grid md:grid-cols-2 gap-6">
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌕 满月优先</div>
            <p class="text-[#a0937d] text-sm">复杂任务、编程、长文写作使用 GPT、Gemini、Claude 等顶级模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
            <div class="text-2xl mb-3">🌓 半月降级</div>
            <p class="text-[#a0937d] text-sm">日常任务、总结、改写、翻译使用 Kimi、MiniMax、Qwen 等高效模型。</p>
          </div>
          <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6 md:col-span-2">
            <div class="text-2xl mb-3">🌑 新月兜底</div>
            <p class="text-[#a0937d] text-sm">聊天、续写、润色等基础任务使用轻量快速模型，新月时段不限量使用。</p>
          </div>
        </div>
      </section>

      <!-- Pricing preview -->
      <section class="py-12 text-center">
        <h2 class="text-[#f5f5dc] text-2xl font-bold mb-2">简单定价 💰</h2>
        <p class="text-[#a0937d] mb-8">选择适合你的套餐</p>
        <div class="grid md:grid-cols-3 gap-6 text-left">
          ${plans.map((plan, i) => `
            <div class="bg-[#1a1410] border ${i === 1 ? 'border-[#f5f5dc]' : 'border-[#3d2f1f]'} rounded-2xl p-6 ${i === 1 ? 'ring-1 ring-[#f5f5dc]' : ''}">
              <div class="text-[#a0937d] text-sm mb-1">${plan.name}</div>
              <div class="text-[#f5f5dc] text-3xl font-bold mb-1">${plan.price}</div>
              <ul class="text-[#a0937d] text-xs space-y-1 mt-4">
                <li>🌕 ${plan.fullMoon}</li>
                <li>🌓 ${plan.halfMoon}</li>
                <li>🌑 ${plan.newMoon}</li>
              </ul>
            </div>
          `).join('')}
        </div>
        <a href="/pricing" class="inline-block mt-8 text-[#f5f5dc] hover:underline">查看全部套餐 →</a>
      </section>
    </main>

    ${footer()}
  `);
}

function pricingPage() {
  return baseHtml(`
    ${navbar('/pricing')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="text-center mb-12">
        <div class="text-4xl mb-4">💰</div>
        <h1 class="text-3xl font-bold text-[#f5f5dc] mb-2">套餐定价</h1>
        <p class="text-[#a0937d]">选择适合你的使用量</p>
      </div>

      <div class="grid md:grid-cols-3 gap-6">
        ${plans.map((plan, i) => `
          <div class="bg-[#1a1410] border ${i === 1 ? 'border-[#f5f5dc] ring-1 ring-[#f5f5dc]' : 'border-[#3d2f1f]'} rounded-2xl p-8 text-center">
            ${i === 1 ? '<div class="text-[#f5f5dc] text-xs font-medium mb-2">推荐</div>' : ''}
            <h2 class="text-[#f5f5dc] text-xl font-bold mb-4">${plan.name}</h2>
            <div class="text-[#f5f5dc] text-4xl font-bold mb-1">${plan.price}</div>
            <div class="text-[#a0937d] text-sm mb-6">每月</div>
            <ul class="text-left text-[#a0937d] text-sm space-y-3 mb-8">
              <li class="flex items-center gap-2"><span>🌕</span> 满月 ${plan.fullMoon}</li>
              <li class="flex items-center gap-2"><span>🌓</span> 半月 ${plan.halfMoon}</li>
              <li class="flex items-center gap-2"><span>🌑</span> 新月 ${plan.newMoon}</li>
              <li class="flex items-center gap-2"><span>✓</span> 自动路由切换</li>
              ${i === 2 ? '<li class="flex items-center gap-2"><span>✓</span> 长上下文</li><li class="flex items-center gap-2"><span>✓</span> 高优先级</li>' : ''}
            </ul>
            <a href="/register" class="block w-full ${i === 1 ? 'bg-[#f5f5dc] text-black' : 'border border-[#f5f5dc] text-[#f5f5dc]'} px-6 py-3 rounded-full font-medium hover:opacity-90">立即开通</a>
          </div>
        `).join('')}
      </div>

      <div class="mt-12 text-center text-[#7a6f5d] text-sm">
        <p>🌙 所有套餐均支持随时升级或降级</p>
      </div>
    </main>

    ${footer()}
  `);
}

function loginPage() {
<<<<<<< HEAD
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">登录 MOON</h1>
        <p class="text-[#a0937d] mt-2">欢迎回来</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <form class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" placeholder="••••••••" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">登录</button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          还没有账号？<a href="/register" class="text-[#f5f5dc] hover:underline">立即注册</a>
        </div>
      </div>
    </main>

    ${footer()}
  `);
}

function registerPage() {
  return baseHtml(`
    ${navbar()}

    <main class="max-w-md mx-auto px-4 py-12">
      <div class="text-center mb-8">
        <div class="text-4xl mb-4">🌙</div>
        <h1 class="text-2xl font-bold text-[#f5f5dc]">注册 MOON</h1>
        <p class="text-[#a0937d] mt-2">创建账号，开始使用</p>
      </div>

      <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
        <form class="space-y-4">
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">邮箱</label>
            <input type="email" placeholder="your@email.com" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <div>
            <label class="text-[#a0937d] text-sm block mb-2">密码</label>
            <input type="password" placeholder="设置密码" class="w-full bg-black border border-[#3d2f1f] rounded-lg px-4 py-3 text-[#f5f5dc] placeholder-[#5a4d3d] focus:border-[#f5f5dc] outline-none" />
          </div>
          <button type="submit" class="w-full bg-[#f5f5dc] text-black py-3 rounded-full font-medium hover:bg-[#d4c4a8]">注册</button>
        </form>

        <div class="mt-6 text-center text-[#7a6f5d] text-sm">
          已有账号？<a href="/login" class="text-[#f5f5dc] hover:underline">立即登录</a>
        </div>
      </div>
    </main>

    ${footer()}
  `);
}

function dashboardPage() {
  return baseHtml(`
    ${navbar('/dashboard')}

    <main class="max-w-5xl mx-auto px-4 py-12">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-[#f5f5dc]">用户后台 🌙</h1>
        <p class="text-[#a0937d]">管理你的账户和订阅</p>
      </div>

      <div class="grid md:grid-cols-2 gap-6">
        <!-- Current Plan -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">当前套餐</h2>
          <div class="text-[#a0937d] text-sm mb-4">入门版</div>
          <div class="text-[#f5f5dc] text-2xl font-bold mb-1">¥9.9 / 月</div>
          <div class="text-[#7a6f5d] text-xs mb-6">下次扣款日期：2026-05-21</div>
          <a href="/pricing" class="inline-block text-[#f5f5dc] text-sm hover:underline">升级套餐 →</a>
        </div>

        <!-- Usage -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">今日用量</h2>
          <div class="space-y-3">
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌕 满月</span>
                <span>12 / 30</span>
              </div>
              <div class="h-2 bg-black rounded-full overflow-hidden">
                <div class="h-full bg-[#f5f5dc] rounded-full" style="width: 40%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌓 半月</span>
                <span>45 / 200</span>
              </div>
              <div class="h-2 bg-black rounded-full overflow-hidden">
                <div class="h-full bg-[#d4c4a8] rounded-full" style="width: 22%"></div>
              </div>
            </div>
            <div>
              <div class="flex justify-between text-[#a0937d] text-sm mb-1">
                <span>🌑 新月</span>
                <span>不限</span>
              </div>
=======
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="MOON 登录入口。Model Always Online." />
    <title>MOON | 登录</title>
    <style>
      :root {
        --bg: #fffaf5; --panel: rgba(255,255,255,.88); --text: #2b2333;
        --muted: #7f6f7d; --primary: #f08787; --line: #f0ddd3;
        --shadow: 0 20px 60px rgba(70,40,50,.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background: radial-gradient(circle at top left, rgba(240,135,135,.16), transparent 30%),
          radial-gradient(circle at top right, rgba(255,199,167,.26), transparent 28%),
          linear-gradient(180deg, #fffdf9 0%, var(--bg) 100%);
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 960px; margin: 0 auto; padding: 24px; min-height: 100vh; display: grid; align-items: center; }
      .panel { border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(16px); border-radius: 32px; padding: 28px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; }
      .logo { width: 46px; height: 46px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, #fff7eb, #f8d9cb 55%, #f08787 100%); box-shadow: inset 0 1px 2px rgba(255,255,255,.5); position: relative; }
      .logo::after { content: ""; position: absolute; inset: 11px 0 11px 18px; border-radius: 999px; background: rgba(255,255,255,.96); }
      .button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; border-radius: 999px; font-weight: 600; border: 1px solid var(--line); background: #fff; }
      .button.primary { background: var(--primary); color: #fff; border-color: transparent; }
      .grid { display: grid; gap: 18px; margin-top: 28px; grid-template-columns: repeat(2, minmax(0, 1fr)); }
      .card { border: 1px solid var(--line); border-radius: 28px; padding: 24px; background: rgba(255,255,255,.78); }
      .kicker { color: #b66f61; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
      .title { margin: 10px 0 8px; font-size: 28px; letter-spacing: -.04em; }
      .muted { color: var(--muted); line-height: 1.7; }
      .field { display: grid; gap: 8px; margin-top: 16px; }
      .field input { width: 100%; border-radius: 16px; border: 1px solid var(--line); padding: 14px 16px; font-size: 15px; outline: none; background: #fff; }
      .field input:focus { border-color: #f08787; box-shadow: 0 0 0 3px rgba(240,135,135,.12); }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
      .note { margin-top: 18px; font-size: 13px; color: var(--muted); }
      @media (max-width: 860px) { .grid { grid-template-columns: 1fr; } .title { font-size: 24px; } }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="panel">
        <div class="row">
          <div class="brand">
            <div class="logo" aria-hidden="true"></div>
            <div>
              <div style="font-size:18px;">MOON</div>
              <div style="font-size:12px;color:var(--muted);font-weight:500;">Model Always Online</div>
>>>>>>> origin/agent/claude-for-moon/2bd0d598
            </div>
          </div>
        </div>
<<<<<<< HEAD

        <!-- API Key -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">API Key</h2>
          <div class="bg-black border border-[#3d2f1f] rounded-lg p-3 mb-4">
            <code class="text-[#7a6f5d] text-xs break-all">moon_sk_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx</code>
          </div>
          <button class="text-[#f5f5dc] text-sm hover:underline">重新生成 Key</button>
        </div>

        <!-- Quick Actions -->
        <div class="bg-[#1a1410] border border-[#3d2f1f] rounded-2xl p-6">
          <h2 class="text-[#f5f5dc] font-bold mb-4">快捷操作</h2>
          <div class="space-y-3">
            <a href="/pricing" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>💰</span> 升级套餐
            </a>
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>📊</span> 使用统计
            </a>
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>📝</span> API 文档
            </a>
            <a href="#" class="flex items-center gap-3 text-[#a0937d] hover:text-[#f5f5dc]">
              <span>💬</span> 联系我们
            </a>
          </div>
        </div>
      </div>
    </main>

    ${footer()}
  `);
=======
        <div style="margin-top:26px;max-width:700px;">
          <div class="kicker">Access Portal</div>
          <h1 class="title">登录或注册，继续使用 MOON</h1>
        </div>
        <div class="grid">
          <article class="card">
            <div class="kicker">登录</div>
            <h2 class="title" style="font-size:24px;">已有账号</h2>
            <p class="muted">输入邮箱和密码进入系统。</p>
            <div class="field"><label><div class="kicker">邮箱</div><input type="email" placeholder="name@example.com" /></label></div>
            <div class="field"><label><div class="kicker">密码</div><input type="password" placeholder="输入密码" /></label></div>
            <div class="actions"><button class="button primary">登录</button></div>
          </article>
          <article class="card">
            <div class="kicker">注册</div>
            <h2 class="title" style="font-size:24px;">新用户</h2>
            <p class="muted">创建账号后可订阅套餐。</p>
            <div class="actions"><a class="button primary" href="/register">去注册页</a></div>
          </article>
        </div>
        <p class="note">只是想看产品？<a href="/" style="color:var(--primary);">返回首页</a></p>
      </section>
    </div>
  </body>
</html>`;
>>>>>>> origin/agent/claude-for-moon/2bd0d598
}

function registerPage() {
  return `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="description" content="MOON 注册入口。Model Always Online." />
    <title>MOON | 注册</title>
    <style>
      :root {
        --bg: #fffaf5; --panel: rgba(255,255,255,.88); --text: #2b2333;
        --muted: #7f6f7d; --primary: #f08787; --line: #f0ddd3;
        --shadow: 0 20px 60px rgba(70,40,50,.12);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: var(--text);
        background: radial-gradient(circle at top left, rgba(240,135,135,.16), transparent 30%),
          radial-gradient(circle at top right, rgba(255,199,167,.26), transparent 28%),
          linear-gradient(180deg, #fffdf9 0%, var(--bg) 100%);
      }
      a { color: inherit; text-decoration: none; }
      .wrap { max-width: 960px; margin: 0 auto; padding: 24px; min-height: 100vh; display: grid; align-items: center; }
      .panel { border: 1px solid var(--line); background: var(--panel); box-shadow: var(--shadow); backdrop-filter: blur(16px); border-radius: 32px; padding: 28px; }
      .row { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; }
      .brand { display: flex; align-items: center; gap: 14px; font-weight: 700; }
      .logo { width: 46px; height: 46px; border-radius: 999px; background: radial-gradient(circle at 30% 30%, #fff7eb, #f8d9cb 55%, #f08787 100%); box-shadow: inset 0 1px 2px rgba(255,255,255,.5); position: relative; }
      .logo::after { content: ""; position: absolute; inset: 11px 0 11px 18px; border-radius: 999px; background: rgba(255,255,255,.96); }
      .button { display: inline-flex; align-items: center; justify-content: center; padding: 12px 18px; border-radius: 999px; font-weight: 600; border: 1px solid var(--line); background: #fff; cursor: pointer; font-size: 15px; }
      .button.primary { background: var(--primary); color: #fff; border-color: transparent; }
      .card { border: 1px solid var(--line); border-radius: 28px; padding: 24px; background: rgba(255,255,255,.78); max-width: 480px; margin-top: 28px; }
      .kicker { color: #b66f61; font-size: 14px; letter-spacing: .08em; text-transform: uppercase; }
      .title { margin: 10px 0 8px; font-size: 28px; letter-spacing: -.04em; }
      .muted { color: var(--muted); line-height: 1.7; }
      .field { display: grid; gap: 8px; margin-top: 16px; }
      .field input { width: 100%; border-radius: 16px; border: 1px solid var(--line); padding: 14px 16px; font-size: 15px; outline: none; background: #fff; }
      .field input:focus { border-color: #f08787; box-shadow: 0 0 0 3px rgba(240,135,135,.12); }
      .actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 18px; }
      .note { margin-top: 18px; font-size: 13px; color: var(--muted); }
    </style>
  </head>
  <body>
    <div class="wrap">
      <section class="panel">
        <div class="row">
          <div class="brand">
            <div class="logo" aria-hidden="true"></div>
            <div>
              <div style="font-size:18px;">MOON</div>
              <div style="font-size:12px;color:var(--muted);font-weight:500;">Model Always Online</div>
            </div>
          </div>
          <a class="button" href="/">返回首页</a>
        </div>
        <div style="margin-top:26px;">
          <div class="kicker">新用户注册</div>
          <h1 class="title">创建账号，开始使用 MOON</h1>
          <p class="muted">创建账号后可订阅套餐并生成 API Key。</p>
        </div>
        <article class="card">
          <div class="field"><label><div class="kicker">用户名</div><input type="text" placeholder="输入用户名" /></label></div>
          <div class="field"><label><div class="kicker">邮箱</div><input type="email" placeholder="name@example.com" /></label></div>
          <div class="field"><label><div class="kicker">密码</div><input type="password" placeholder="设置密码" /></label></div>
          <div class="actions"><button class="button primary">注册</button></div>
        </article>
        <p class="note">已有账号？<a href="/login" style="color:var(--primary);">直接登录</a></p>
      </section>
    </div>
  </body>
</html>`;
}
app.get("/", (c) => c.html(moonPage()));
app.get("/pricing", (c) => c.html(pricingPage()));
app.get("/login", (c) => c.html(loginPage()));
app.get("/register", (c) => c.html(registerPage()));
app.get("/dashboard", (c) => c.html(dashboardPage()));
app.get("/admin/login", (c) => c.html(loginPage()));

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