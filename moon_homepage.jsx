function PhaseMoon({ phase = "full", size = "md" }) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-8 w-8",
    lg: "h-14 w-14",
  };

  if (phase === "full") {
    return (
      <div
        className={`relative ${sizes[size]} rounded-full bg-[#f08787] shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)]`}
      />
    );
  }

  if (phase === "half") {
    return (
      <div
        className={`relative ${sizes[size]} rounded-full bg-[#ffc7a7] shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)] overflow-hidden`}
      >
        <div className="absolute inset-y-0 right-0 w-1/2 bg-white/90" />
      </div>
    );
  }

  return (
    <div className={`relative ${sizes[size]}`}>
      <div className="absolute inset-0 rounded-full bg-[#fee2ad] shadow-[inset_0_1px_2px_rgba(255,255,255,0.35)]" />
      <div className="absolute inset-y-0 left-[32%] w-[78%] rounded-full bg-white/96" />
    </div>
  );
}

export default function MoonHomepage() {
  const plans = [
    {
      name: "入门",
      price: "¥9.9",
      desc: "日常使用。",
      features: ["满月 30 次 / 天", "半月 200 次 / 天", "新月不限", "自动路由切换"],
      highlight: false,
    },
    {
      name: "普通",
      price: "¥39",
      desc: "主力套餐。",
      features: ["满月 200 次 / 天", "半月 1000 次 / 天", "新月不限", "更稳定的优先队列"],
      highlight: true,
    },
    {
      name: "高级",
      price: "¥99",
      desc: "高频使用。",
      features: ["满月 1000 次 / 天", "半月 5000 次 / 天", "新月不限", "长上下文与高优先级"],
      highlight: false,
    },
  ];

  return (
    <div className="min-h-screen bg-white text-slate-800">
      <div className="mx-auto max-w-6xl px-6 py-8 sm:px-8 lg:px-12">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-white/85 shadow-sm ring-1 ring-[#ffd6bf]">
              <PhaseMoon phase="half" size="sm" />
            </div>
            <div>
              <div className="text-lg font-semibold tracking-tight">MOON</div>
              <div className="text-xs text-[#c97f6d]">Model Always Online</div>
            </div>
          </div>
          <button className="rounded-full bg-[#f08787] px-5 py-2.5 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
            开始体验
          </button>
        </header>

        <main className="pt-16 sm:pt-24">
          <section className="text-center">
            <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-white/85 shadow-md ring-1 ring-[#ffd6bf]">
              <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#fff3d6] shadow-inner">
                <PhaseMoon phase="full" size="md" />
              </div>
            </div>
            <div className="mx-auto inline-flex items-center gap-2 rounded-full bg-white/80 px-4 py-1.5 text-sm text-[#b87263] ring-1 ring-[#ffd6bf] backdrop-blur">
              <PhaseMoon phase="new" size="sm" />
              从满月到新月，始终在线
            </div>
            <h1 className="mx-auto mt-6 max-w-4xl text-4xl font-semibold tracking-tight text-[#8c5a52] sm:text-6xl">
              大模型一直在线
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-base leading-8 text-[#9f6d60] sm:text-lg">
              优先使用满月模型，其次半月模型，新月不限。
            </p>
            <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <button className="rounded-full bg-[#f08787] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
                立即开始
              </button>
              <button className="rounded-full bg-white px-6 py-3 text-sm font-medium text-[#9a6c61] ring-1 ring-[#ffd6bf] shadow-sm transition hover:bg-[#fff8f3]">
                查看套餐
              </button>
            </div>
          </section>

          <section className="mt-20 grid gap-6 lg:grid-cols-2 lg:items-center">
            <div className="rounded-[32px] bg-white/82 p-8 shadow-sm ring-1 ring-[#ffd6bf] backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-semibold text-[#3b345f]">满月</div>
                </div>
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#fff0c8] ring-1 ring-[#fee2ad]">
                  <PhaseMoon phase="full" size="md" />
                </div>
              </div>
              <p className="mt-5 text-sm leading-7 text-[#9f6d60]">
                满月优先，半月其次，新月不限。
              </p>
              <div className="mt-6 grid grid-cols-3 gap-3">
                <div className="rounded-2xl bg-[#fff6ef] p-4">
                  <div className="text-xs text-[#c97f6d]">满月</div>
                  <div className="mt-2 text-lg font-semibold">30</div>
                </div>
                <div className="rounded-2xl bg-[#fff6ef] p-4">
                  <div className="text-xs text-[#c97f6d]">半月</div>
                  <div className="mt-2 text-lg font-semibold">200</div>
                </div>
                <div className="rounded-2xl bg-[#fff6ef] p-4">
                  <div className="text-xs text-[#c97f6d]">新月</div>
                  <div className="mt-2 text-lg font-semibold">不限</div>
                </div>
              </div>
            </div>

            <div className="grid gap-4">
              <div className="rounded-[28px] bg-white/76 p-6 shadow-sm ring-1 ring-[#ffd6bf]">
                <div className="flex items-center gap-2 text-base font-semibold text-[#3b345f]"><PhaseMoon phase="full" size="sm" />满月</div>
                <p className="mt-2 text-sm leading-7 text-[#9f6d60]">复杂任务、长文本、编程。</p>
              </div>
              <div className="rounded-[28px] bg-white/76 p-6 shadow-sm ring-1 ring-[#ffd6bf]">
                <div className="flex items-center gap-2 text-base font-semibold text-[#3b345f]"><PhaseMoon phase="half" size="sm" />半月</div>
                <p className="mt-2 text-sm leading-7 text-[#9f6d60]">日常任务、总结、改写、翻译。</p>
              </div>
              <div className="rounded-[28px] bg-white/76 p-6 shadow-sm ring-1 ring-[#ffd6bf]">
                <div className="flex items-center gap-2 text-base font-semibold text-[#3b345f]"><PhaseMoon phase="new" size="sm" />新月</div>
                <p className="mt-2 text-sm leading-7 text-[#9f6d60]">新月不限。聊天、改写、总结。</p>
              </div>
            </div>
          </section>

          <section className="mt-24">
            <div className="text-center">
              <div className="text-sm text-[#c97f6d]">状态模型表</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#8c5a52] sm:text-4xl">不同月相，对应不同模型层</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#9f6d60]">
                满月、半月、新月对应不同模型层。
              </p>
            </div>

            <div className="mt-10 grid gap-4">
              <div className="grid gap-4 rounded-[28px] bg-white/82 p-5 shadow-sm ring-1 ring-[#ffd6bf] sm:grid-cols-[140px_1fr] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0c8] ring-1 ring-[#fee2ad]">
                    <PhaseMoon phase="full" size="sm" />
                  </div>
                  <div>
                    <div className="text-sm text-[#c97f6d]">状态</div>
                    <div className="text-lg font-semibold text-[#3b345f]">满月</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-[#c97f6d]">优先模型</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {['GPT', 'Gemini', 'Claude'].map((model) => (
                      <span key={model} className="rounded-full bg-[#fff6ef] px-4 py-2 text-sm text-[#9a6c61] ring-1 ring-[#ffe1cf]">
                        {model}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#9f6d60]">复杂任务、编程、长文写作。</p>
                </div>
              </div>

              <div className="grid gap-4 rounded-[28px] bg-white/82 p-5 shadow-sm ring-1 ring-[#ffd6bf] sm:grid-cols-[140px_1fr] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#fff0f0] ring-1 ring-[#ffd6bf]">
                    <PhaseMoon phase="half" size="sm" />
                  </div>
                  <div>
                    <div className="text-sm text-[#c97f6d]">状态</div>
                    <div className="text-lg font-semibold text-[#3b345f]">半月</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-[#c97f6d]">优先模型</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {['Kimi', 'MiniMax', 'Qwen'].map((model) => (
                      <span key={model} className="rounded-full bg-[#fff6ef] px-4 py-2 text-sm text-[#9a6c61] ring-1 ring-[#ffe1cf]">
                        {model}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#9f6d60]">总结、改写、翻译、常规问答。</p>
                </div>
              </div>

              <div className="grid gap-4 rounded-[28px] bg-white/82 p-5 shadow-sm ring-1 ring-[#ffd6bf] sm:grid-cols-[140px_1fr] sm:p-6">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#f8fab4] ring-1 ring-[#e8efae]">
                    <PhaseMoon phase="new" size="sm" />
                  </div>
                  <div>
                    <div className="text-sm text-[#c97f6d]">状态</div>
                    <div className="text-lg font-semibold text-[#3b345f]">新月</div>
                  </div>
                </div>
                <div>
                  <div className="text-sm text-[#c97f6d]">优先模型</div>
                  <div className="mt-3 flex flex-wrap gap-3">
                    {['轻量模型', '快速模型', '低成本模型'].map((model) => (
                      <span key={model} className="rounded-full bg-[#fff6ef] px-4 py-2 text-sm text-[#9a6c61] ring-1 ring-[#ffe1cf]">
                        {model}
                      </span>
                    ))}
                  </div>
                  <p className="mt-4 text-sm leading-7 text-[#9f6d60]">聊天、续写、润色。</p>
                </div>
              </div>
            </div>
          </section>

          <section className="mt-24">
            <div className="text-center">
              <div className="text-sm text-[#c97f6d]">套餐说明</div>
              <h2 className="mt-2 text-3xl font-semibold tracking-tight text-[#8c5a52] sm:text-4xl">三档套餐</h2>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#9f6d60]">
                按使用量选择套餐。
              </p>
            </div>

            <div className="mt-10 grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`rounded-[32px] p-7 shadow-sm ring-1 transition ${
                    plan.highlight
                      ? "bg-[#f08787] text-white ring-[#6f63d9]"
                      : "bg-white/85 text-[#8c5a52] ring-[#ffd6bf]"
                  }`}
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className={`text-sm ${plan.highlight ? "text-[#fff1ea]" : "text-[#c97f6d]"}`}>{plan.name}</div>
                      <div className="mt-3 text-4xl font-semibold tracking-tight">{plan.price}</div>
                      <div className={`mt-1 text-sm ${plan.highlight ? "text-[#fff1ea]" : "text-[#c97f6d]"}`}>/ 月</div>
                    </div>
                    {plan.highlight && (
                      <span className="rounded-full bg-white/14 px-3 py-1 text-xs text-white ring-1 ring-white/20">
                        推荐
                      </span>
                    )}
                  </div>
                  <p className={`mt-5 text-sm leading-7 ${plan.highlight ? "text-[#fff6f1]" : "text-[#9f6d60]"}`}>
                    {plan.desc}
                  </p>
                  <div className="mt-6 space-y-3">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className={`flex items-center gap-3 rounded-2xl px-4 py-3 text-sm ${
                          plan.highlight ? "bg-white/10 text-white" : "bg-[#fff6ef] text-[#9a6c61]"
                        }`}
                      >
                        <span className={`inline-block h-2.5 w-2.5 rounded-full ${plan.highlight ? "bg-white" : "bg-[#f08787]"}`} />
                        {feature}
                      </div>
                    ))}
                  </div>
                  <button
                    className={`mt-8 w-full rounded-full px-5 py-3 text-sm font-medium transition ${
                      plan.highlight
                        ? "bg-white text-[#df7272] hover:bg-[#fff4ef]"
                        : "bg-[#f08787] text-white hover:opacity-90"
                    }`}
                  >
                    立即开通
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-24 pb-16 text-center">
            <div className="mx-auto max-w-3xl rounded-[32px] bg-white/80 px-8 py-12 shadow-sm ring-1 ring-[#ffd6bf]">
              <h3 className="text-2xl font-semibold tracking-tight text-[#8c5a52] sm:text-3xl">MOON — Model Always Online</h3>
              <p className="mx-auto mt-4 max-w-2xl text-base leading-8 text-[#9f6d60]">
                满月、半月、新月始终在线。
              </p>
              <button className="mt-8 rounded-full bg-[#f08787] px-6 py-3 text-sm font-medium text-white shadow-sm transition hover:opacity-90">
                现在开始
              </button>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
