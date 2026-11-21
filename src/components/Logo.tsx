interface LogoProps {
  size?: "sm" | "md" | "lg";
  showByline?: boolean;
}

const sizes = {
  sm: { mark: "h-8 w-8 rounded-lg", icon: 18, text: "text-lg" },
  md: { mark: "h-10 w-10 rounded-xl", icon: 22, text: "text-xl" },
  lg: { mark: "h-12 w-12 rounded-2xl", icon: 26, text: "text-2xl" },
};

export function Logo({ size = "md", showByline = false }: LogoProps) {
  const s = sizes[size];
  return (
    <div className="flex items-center gap-3">
      <span
        className={`${s.mark} grid shrink-0 place-items-center bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lift`}
        aria-hidden
      >
        <svg width={s.icon} height={s.icon} viewBox="0 0 24 24" fill="none">
          <path d="M6 18V6l12 12V6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <span className="leading-tight">
        <span className={`${s.text} block font-semibold tracking-tight text-ink-900`}>
          NIF<span className="text-brand-600">Pass</span>
        </span>
        {showByline && <span className="block text-xs font-medium text-ink-400">by GoGentik</span>}
      </span>
    </div>
  );
}
