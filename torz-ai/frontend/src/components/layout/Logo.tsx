import { useId } from "react";

export function LogoMark({ className = "size-8" }: { className?: string }) {
  const id = useId().replace(/:/g, "");
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}g`} x1="10" y1="8" x2="56" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#67E8F9" />
          <stop offset="0.55" stopColor="#22D3EE" />
          <stop offset="1" stopColor="#3B82F6" />
        </linearGradient>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="64" y2="64" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#13213B" />
          <stop offset="1" stopColor="#060A13" />
        </linearGradient>
      </defs>
      <rect x="2" y="2" width="60" height="60" rx="16" fill={`url(#${id}b)`} />
      <rect x="2.75" y="2.75" width="58.5" height="58.5" rx="15.25" stroke={`url(#${id}g)`} strokeOpacity="0.6" strokeWidth="1.5" />
      <path d="M15.5 21h23" stroke={`url(#${id}g)`} strokeWidth="6.2" strokeLinecap="round" />
      <path d="M27 21.5v20.5c0 3 1.9 4.8 4.8 4.8h4.2" stroke={`url(#${id}g)`} strokeWidth="6.2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M46.5 13.5l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#E6FCFF" />
    </svg>
  );
}

export function Logo({ collapsed }: { collapsed?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark className="size-8 shrink-0" />
      {!collapsed && (
        <div className="leading-none">
          <div className="text-[1.05rem] font-bold tracking-[0.12em] text-ink">
            TORZ <span className="gradient-text">AI</span>
          </div>
          <div className="mt-1 text-[0.62rem] font-medium uppercase tracking-[0.2em] text-faint">Write · Study · Own it</div>
        </div>
      )}
    </div>
  );
}
