import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Parent-company branding shown on every panel and on the login
 * screen. Keep it small but unmistakable.
 *
 * - "Safa Web Solution" uses the app's emerald brand palette.
 * - "Made in India" is written in tiranga colours with a red heart.
 */
export function MadeBy({
  className,
  tone = "dark",
}: {
  className?: string;
  tone?: "dark" | "light";
}) {
  const dark = tone === "dark";
  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[10.5px] leading-tight",
        dark ? "text-ink-400" : "text-ink-500",
        className
      )}
    >
      <span className="uppercase tracking-[0.14em] opacity-80">Made By</span>
      <span
        className={cn(
          "bg-gradient-to-r bg-clip-text font-bold tracking-wide text-transparent",
          dark
            ? "from-brand-300 via-emerald-200 to-teal-300"
            : "from-brand-700 via-emerald-600 to-teal-600"
        )}
      >
        Safa Web Solution
      </span>
      <span className="opacity-50">•</span>
      <span className="inline-flex items-center gap-1 font-semibold">
        <Heart
          aria-hidden
          className="h-3 w-3 shrink-0 fill-red-500 text-red-500"
        />
        <span aria-label="Made in India">
          <span className="text-[#FF9933]">Made</span>{" "}
          <span className={dark ? "text-white" : "text-[#0b3d91]"}>in</span>{" "}
          <span className="text-[#138808]">India</span>
        </span>
      </span>
    </div>
  );
}
