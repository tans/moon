function PhaseMoon({ phase = "full", size = "md" }) {
  const sizes = {
    sm: "h-4 w-4",
    md: "h-7 w-7",
    lg: "h-10 w-10",
  };

  if (phase === "full") {
    return <div className={`${sizes[size]} rounded-full bg-[#F08787]`} />;
  }

  if (phase === "half") {
    return (
      <div className={`${sizes[size]} relative overflow-hidden rounded-full bg-[#FFC7A7]`}>
        <div className="absolute inset-y-0 right-0 w-1/2 bg-white" />
      </div>
    );
  }

  return (
    <div className={`${sizes[size]} relative`}>
      <div className="absolute inset-0 rounded-full bg-[#FEE2AD]" />
      <div className="absolute inset-y-0 left-[34%] w-[78%] rounded-full bg-white" />
    </div>
  );
}

function AgentButton({ name, enabled = false }) {
  return (
    <div className="flex h-11 items-center justify-between rounded-[16px] border border-[#F5E4DA] bg-white px-4 text-sm font-medium text-[#8C5A52]">
      <span>{name}</span>
      <button
        className={`relative h-6 w-11 rounded-full transition ${enabled ? "bg-[#F08787]" : "bg-[#F3E3DA]"}`}
        aria-label={`${name} toggle`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition ${enabled ? "left-[22px]" : "left-0.5"}`}
        />
      </button>
    </div>
  );
}

export default function MoonAppSingleScreen() {
  return (
    <div className="min-h-screen bg-white px-6 py-10">
      <div className="mx-auto max-w-[420px] rounded-[36px] border border-[#E9D7CE] bg-[#2B211E] p-3 shadow-[0_18px_50px_rgba(0,0,0,0.10)]">
        <div className="mx-auto mb-3 h-6 w-28 rounded-full bg-[#1E1715]" />

        <div className="overflow-hidden rounded-[30px] bg-white">
          <div className="flex items-center justify-between px-5 pb-4 pt-5">
            <div>
              <div className="text-xs text-[#C97F6D]">MOON</div>
              <div className="mt-1 text-[26px] font-semibold tracking-tight text-[#3B345F]">当前状态</div>
            </div>
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[#FFF1E5]">
              <PhaseMoon phase="full" size="lg" />
            </div>
          </div>

          <div className="mt-4 px-5">
            <div className="rounded-[22px] border border-[#F5E4DA] bg-[#FFF9F6] p-4">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-[11px] text-[#C97F6D]">当前模型</div>
                  <div className="mt-1 text-base font-semibold text-[#3B345F]">GPT / Gemini / Claude</div>
                </div>
                <PhaseMoon phase="full" size="md" />
              </div>

              <div className="mt-4 relative pt-8">
                <div className="absolute left-[2%] top-0 z-10 flex flex-col items-center">
                  <div className="relative flex h-6 w-6 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-[#F5E4DA]">
                    <PhaseMoon phase="full" size="sm" />
                    <div className="absolute left-1/2 top-full h-2 w-2 -translate-x-1/2 rotate-45 bg-white ring-1 ring-[#F5E4DA]" />
                  </div>
                </div>
                <div className="h-3 overflow-hidden rounded-full bg-[#FAEFE8]">
                  <div className="flex h-full w-full">
                    <div className="h-full w-[5.56%] bg-[#F08787]" />
                    <div className="h-full w-[27.78%] bg-[#FFC7A7]" />
                    <div className="h-full w-[66.67%] bg-[#FEE2AD]" />
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="px-5 pb-5 pt-4">
            <div className="grid grid-cols-2 gap-3">
              <AgentButton name="Codex" enabled />
              <AgentButton name="OpenClaw" />
              <AgentButton name="Cline" enabled />
              <AgentButton name="Continue" />
              <AgentButton name="Aider" />
              <AgentButton name="OpenHands" enabled />
              <AgentButton name="Cursor" />
              <AgentButton name="Roo Code" />
              <AgentButton name="Windsurf" enabled />
              <AgentButton name="Goose" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
