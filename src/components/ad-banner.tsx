"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Heart, Megaphone, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { listActiveAds, recordAdEvent } from "@/lib/repo";
import type { Ad } from "@/lib/types";
import { cn } from "@/lib/utils";

const SLIDE_MS = 10_000;
const DISMISS_KEY = "anjuman.ads.dismissed";

type Slide = { kind: "brand" } | { kind: "ad"; ad: Ad };

/**
 * Top banner shown above every panel.
 *
 * Slide 1 is always the anjuman identity (logo + name + masjid).
 * Then each live ad — global or targeted to this tenant — rotates
 * every 10 seconds with a 3D flip transition.
 *
 * When no ads are live the banner renders nothing, so tenants who
 * never received an ad keep exactly the old layout.
 */
export function AdBanner() {
  const { user } = useAuth();
  const [ads, setAds] = useState<Ad[]>([]);
  const [index, setIndex] = useState(0);
  const [dismissed, setDismissed] = useState(false);
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const onVisibility = () => setVisible(document.visibilityState === "visible");
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  useEffect(() => {
    try {
      if (window.sessionStorage.getItem(DISMISS_KEY) === "1") setDismissed(true);
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    let alive = true;

    listActiveAds("web")
      .then((list) => {
        if (!alive) return;
        setAds(list);
        setFailed(false);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });

    return () => {
      alive = false;
    };
  }, [user?.id, user?.tenantId, user?.role]);

  const slides = useMemo<Slide[]>(() => {
    if (ads.length === 0) return [];
    return [{ kind: "brand" }, ...ads.map((ad) => ({ kind: "ad" as const, ad }))];
  }, [ads]);

  // Reset to the brand slide whenever the slide set changes.
  useEffect(() => {
    setIndex(0);
  }, [slides.length]);

  useEffect(() => {
    if (slides.length < 2 || !visible) return;
    const id = window.setTimeout(() => {
      setIndex((i) => (i + 1) % slides.length);
    }, SLIDE_MS);
    return () => window.clearTimeout(id);
  }, [index, slides.length, visible]);

  const current = slides[index];
  const isPlatformAdmin = user?.role === "super_admin";

  // Count an impression once per displayed ad slide. Admin previews and
  // background tabs never inflate the numbers.
  useEffect(() => {
    if (!visible || isPlatformAdmin) return;
    if (current?.kind === "ad") {
      void recordAdEvent(current.ad.id, "impression");
    }
  }, [current, visible, isPlatformAdmin]);

  if (!user) return null;
  if (failed || dismissed || slides.length === 0 || !current) return null;

  const close = () => {
    setDismissed(true);
    try {
      window.sessionStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
  };

  return (
    <div
      className="relative mb-5 overflow-hidden rounded-2xl border border-ink-200 bg-ink-900 shadow-[var(--shadow-card)]"
      style={{ perspective: "1400px" }}
    >
      <div key={index} className="ad-flip-in h-[132px] w-full sm:h-[158px] lg:h-[178px]">
        {current.kind === "brand" ? (
          <BrandSlide
            name={user.tenantName || "Anjuman"}
            userName={user.name}
            logoUrl={user.tenantLogoUrl}
            masjid={user.tenantMasjid}
            village={user.tenantVillage}
          />
        ) : (
          <AdSlide ad={current.ad} track={!isPlatformAdmin} />
        )}
      </div>

      {slides.length > 1 && (
        <div className="absolute bottom-3.5 left-4 z-20 flex items-center gap-1.5">
          {slides.map((slide, i) => (
            <button
              key={slide.kind === "brand" ? "brand" : slide.ad.id}
              onClick={() => setIndex(i)}
              aria-label={slide.kind === "brand" ? "Anjuman slide" : `Ad: ${slide.ad.title}`}
              className={cn(
                "h-1.5 rounded-full transition-all",
                i === index
                  ? "w-6 bg-white"
                  : "w-1.5 bg-white/40 hover:bg-white/70"
              )}
            />
          ))}
        </div>
      )}

      <button
        onClick={close}
        className="absolute right-2.5 top-2.5 z-20 rounded-full bg-black/35 p-1.5 text-white/90 backdrop-blur-sm transition hover:bg-black/55"
        aria-label="Hide announcements"
      >
        <X className="h-3.5 w-3.5" />
      </button>

      <div className="absolute inset-x-0 bottom-0 z-10 h-[3px] bg-white/15">
        <div
          key={index}
          className="ad-progress h-full bg-brand-400"
          style={{ animationDuration: `${SLIDE_MS}ms` }}
        />
      </div>
    </div>
  );
}

function BrandSlide({
  name,
  userName,
  logoUrl,
  masjid,
  village,
}: {
  name: string;
  userName: string;
  logoUrl?: string | null;
  masjid?: string;
  village?: string;
}) {
  const firstName = userName.split(" ")[0] || "ji";
  return (
    <div className="relative h-full w-full overflow-hidden bg-gradient-to-r from-emerald-900 via-brand-800 to-teal-700">
      <div className="pointer-events-none absolute -right-10 -top-16 h-52 w-52 rounded-full bg-brand-400/20 blur-2xl" />
      <div className="pointer-events-none absolute -bottom-20 left-1/3 h-48 w-48 rounded-full bg-emerald-300/10 blur-2xl" />

      <div className="relative flex h-full items-center gap-4 px-5 sm:px-6">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-white/10 text-lg font-bold text-white ring-1 ring-white/20 sm:h-16 sm:w-16">
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt="" className="h-full w-full bg-white object-contain" />
          ) : (
            "ا"
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.16em] text-brand-200">
            Community OS
          </p>
          <p className="mt-0.5 truncate text-[17px] font-semibold leading-tight text-white sm:text-[19px]">
            {name}
          </p>
          <p className="mt-0.5 truncate text-[11.5px] text-emerald-100/80">
            {[masjid, village].filter(Boolean).join(" · ") || "Anjuman management, simplified"}
          </p>
        </div>

        <div className="hidden shrink-0 text-right sm:block">
          <p className="text-[11.5px] text-emerald-100/90">As-salamu alaykum,</p>
          <p className="text-[14px] font-semibold text-white">{firstName}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-[10px] text-emerald-200/80">
            <Heart className="h-2.5 w-2.5 fill-red-400 text-red-400" /> Made in India
          </p>
        </div>
      </div>
    </div>
  );
}

function AdSlide({ ad, track }: { ad: Ad; track: boolean }) {
  const click = () => {
    if (track) void recordAdEvent(ad.id, "click");
  };

  const body = (
    <>
      {ad.imageUrl ? (
        // Compact wide banner — the website keeps its original height.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={ad.imageUrl}
          alt={ad.title}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-r from-ink-800 to-ink-700" />
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-ink-900/80 via-ink-900/10 to-transparent" />

      <div className="relative flex h-full flex-col justify-end p-4 sm:p-5">
        <span className="mb-1.5 inline-flex w-fit items-center gap-1 rounded-md bg-black/45 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/90 backdrop-blur-sm">
          <Megaphone className="h-3 w-3" /> Announcement
        </span>
        <p className="line-clamp-2 max-w-[85%] text-[14.5px] font-semibold leading-snug text-white drop-shadow sm:text-[16px]">
          {ad.title}
        </p>
        {ad.linkUrl && (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-200">
            Tap to open <ExternalLink className="h-3 w-3" />
          </p>
        )}
      </div>
    </>
  );

  const className =
    "relative block h-full w-full overflow-hidden bg-ink-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-400 focus-visible:ring-offset-2";

  if (!ad.linkUrl) return <div className={className}>{body}</div>;

  return (
    <a
      href={ad.linkUrl}
      target="_blank"
      rel="noopener noreferrer"
      onClick={click}
      className={className}
    >
      {body}
    </a>
  );
}
