"use client";

// Per-viewer watermark: makes every leaked screenshot traceable to the
// person who took it. Rendered above content, impossible to interact with.
export function Watermark({ lines }: { lines: string[] }) {
  const text = lines.filter(Boolean).join("   ·   ");
  const tiles = Array.from({ length: 60 });
  const stamp = lines.filter(Boolean);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-40 select-none overflow-hidden">
      <div className="absolute -inset-[60%] flex flex-wrap content-center gap-x-12 gap-y-10 rotate-[-24deg] opacity-[0.06]">
        {tiles.map((_, i) => (
          <span key={i} className="whitespace-nowrap text-sm font-medium tracking-[0.2em] text-slate-100">
            {text}
          </span>
        ))}
      </div>
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="rotate-[-16deg] rounded-2xl border-2 border-slate-100/20 px-8 py-4 text-center opacity-[0.09]">
          {stamp.map((l, i) => (
            <div key={i} className="text-lg font-semibold tracking-widest text-slate-100">
              {l}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
