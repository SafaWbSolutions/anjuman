import { cn } from "@/lib/utils";

/**
 * Parent-company branding shown on every panel and on the login
 * screen. Keep it small but unmistakable.
 */
export function MadeBy({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[10.5px] leading-tight",
        tone === "dark" ? "text-ink-400" : "text-ink-500",
        className
      )}
    >
      <span className="uppercase tracking-[0.14em] opacity-80">Made By</span>
      <span className="bg-gradient-to-r from-brand-400 via-emerald-300 to-sky-400 bg-clip-text font-bold tracking-wide text-transparent">
        Safa Web Solution
      </span>
      <span className="opacity-50">•</span>
      <span className="inline-flex items-center gap-1 font-medium">
        <span aria-hidden>🇮🇳</span>
        <span
          className={cn(
            "bg-gradient-to-r bg-clip-text font-semibold text-transparent",
            tone === "dark"
              ? "from-orange-300 via-white to-emerald-300"
              : "from-orange-500 via-ink-800 to-emerald-600"
          )}
        >
          Made in India
        </span>
      </span>
    </div>
  );
}
