"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BarChart3,
  Building2,
  CalendarClock,
  CheckCircle2,
  Eye,
  ExternalLink,
  Globe2,
  ImagePlus,
  Loader2,
  Megaphone,
  MousePointerClick,
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import type { Ad, Tenant } from "@/lib/types";
import {
  createAd,
  deleteAd,
  listAds,
  listTenants,
  setAdActive,
  updateAd,
  uploadAdImage,
} from "@/lib/repo";
import {
  Badge,
  Button,
  Card,
  Drawer,
  EmptyState,
  Field,
  Input,
  PageHeader,
  SearchInput,
  Select,
  StatCard,
  Switch,
  toast,
} from "@/components/ui";
import { cn, formatDate } from "@/lib/utils";

/**
 * Ads / announcements gallery.
 *
 * A platform admin uploads a 16:9 banner (YouTube-thumbnail size) and
 * chooses whether every anjuman sees it or only selected ones. The
 * banner rotates at the top of every panel — the anjuman identity
 * slide stays for 10 s, then each sponsored slide follows.
 */
export default function AdsPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === "super_admin";

  const [ads, setAds] = useState<Ad[]>([]);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [audience, setAudience] = useState("all");
  const [editing, setEditing] = useState<Ad | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      const [nextAds, nextTenants] = await Promise.all([listAds(), listTenants()]);
      setAds(nextAds);
      setTenants(nextTenants);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Ads load nahi hue");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) {
      setLoading(false);
      return;
    }
    void refresh();
  }, [isAdmin, refresh]);

  const rows = useMemo(() => {
    const term = search.trim().toLowerCase();
    return ads.filter((ad) => {
      if (status === "active" && !ad.isActive) return false;
      if (status === "paused" && ad.isActive) return false;
      if (audience === "global" && !ad.isGlobal) return false;
      if (audience === "targeted" && ad.isGlobal) return false;
      if (!term) return true;
      return ad.title.toLowerCase().includes(term);
    });
  }, [ads, search, status, audience]);

  const tenantName = (id: string) =>
    tenants.find((t) => t.id === id)?.name ?? "Unknown anjuman";

  if (!isAdmin) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Ads & announcements" />
        <Card className="p-8 text-center">
          <p className="text-[13px] text-ink-600">
            Sirf platform admin hi ads manage kar sakta hai.
          </p>
        </Card>
      </>
    );
  }

  if (loading) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Ads & announcements" description="Loading…" />
        <Card className="flex items-center justify-center gap-2 p-10 text-[13px] text-ink-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Ad gallery taiyaar ho rahi hai…
        </Card>
      </>
    );
  }

  if (error) {
    return (
      <>
        <PageHeader eyebrow="Platform" title="Ads & announcements" />
        <Card className="p-8 text-center border-red-200 bg-red-50">
          <p className="mb-3 text-[13px] text-red-700">{error}</p>
          <Button onClick={() => void refresh()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </Card>
      </>
    );
  }

  const active = ads.filter((a) => a.isActive).length;
  const global = ads.filter((a) => a.isGlobal).length;
  const targeted = ads.length - global;

  async function handleToggle(ad: Ad) {
    setBusyId(ad.id);
    try {
      await setAdActive(ad.id, !ad.isActive);
      setAds((prev) =>
        prev.map((a) => (a.id === ad.id ? { ...a, isActive: !a.isActive } : a))
      );
      toast(ad.isActive ? "Ad paused" : "Ad live ho gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Update failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(ad: Ad) {
    if (!window.confirm(`"${ad.title}" delete karein? Ye wapas nahi aayegi.`)) return;
    setBusyId(ad.id);
    try {
      await deleteAd(ad.id);
      setAds((prev) => prev.filter((a) => a.id !== ad.id));
      toast("Ad deleted");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Delete failed", "error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Platform"
        title="Ads & announcements"
        description="Upload a banner once and show it to every anjuman — or only to the committees you pick. Slots rotate at the top of every panel."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void refresh()}>
              <RefreshCw className="h-4 w-4" /> Refresh views
            </Button>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New ad
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total ads"
          value={String(ads.length)}
          sub={`${active} live right now`}
          icon={Megaphone}
          tone="brand"
        />
        <StatCard
          label="Global"
          value={String(global)}
          sub="Every anjuman sees these"
          icon={Globe2}
          tone="green"
        />
        <StatCard
          label="Targeted"
          value={String(targeted)}
          sub="Only selected anjumans"
          icon={Users}
          tone="blue"
        />
        <StatCard
          label="Total views"
          value={ads.reduce((s, a) => s + a.impressions, 0).toLocaleString("en-IN")}
          sub={`${ads.reduce((s, a) => s + a.clicks, 0).toLocaleString("en-IN")} clicks`}
          icon={Eye}
          tone="amber"
        />
      </div>

      <div className="mt-5 mb-4 flex flex-wrap items-center gap-3">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Search ads…"
          className="w-full sm:w-64"
        />
        <Select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="w-auto py-2 text-[12.5px]"
        >
          <option value="all">Any status</option>
          <option value="active">Live</option>
          <option value="paused">Paused</option>
        </Select>
        <Select
          value={audience}
          onChange={(e) => setAudience(e.target.value)}
          className="w-auto py-2 text-[12.5px]"
        >
          <option value="all">Any audience</option>
          <option value="global">Global</option>
          <option value="targeted">Selected anjumans</option>
        </Select>
        <span className="ml-auto text-[12px] text-ink-500">{rows.length} ads</span>
      </div>

      {rows.length === 0 ? (
        <Card className="p-0">
          <EmptyState
            icon={ImagePlus}
            title={ads.length === 0 ? "Abhi koi ad nahi hai" : "Filter se kuch nahi mila"}
            description={
              ads.length === 0
                ? "YouTube thumbnail size (1280×720) ka banner upload karein. Admins ise globally ya sirf chuni hui anjumans ko dikha sakte hain."
                : "Search ya filter badal kar dobara dekhein."
            }
            action={
              ads.length === 0 ? (
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" /> Create the first ad
                </Button>
              ) : undefined
            }
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((ad) => (
            <Card key={ad.id} className="overflow-hidden p-0">
              <div className="relative aspect-[16/9] w-full bg-ink-100">
                {ad.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={ad.imageUrl}
                    alt={ad.title}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full items-center justify-center text-ink-300">
                    <ImagePlus className="h-8 w-8" />
                  </div>
                )}

                <div className="absolute left-2.5 top-2.5 flex flex-wrap gap-1.5">
                  <Badge tone={ad.isActive ? "green" : "slate"} dot>
                    {ad.isActive ? "Live" : "Paused"}
                  </Badge>
                  <Badge tone={ad.isGlobal ? "brand" : "violet"}>
                    {ad.isGlobal ? "Global" : `${ad.tenantIds.length} anjuman`}
                  </Badge>
                </div>

                <span className="absolute right-2.5 top-2.5 rounded-md bg-ink-900/70 px-1.5 py-0.5 text-[10.5px] font-medium text-white">
                  #{ad.sortOrder}
                </span>
              </div>

              <div className="p-4">
                <p className="truncate text-[13.5px] font-semibold text-ink-900">
                  {ad.title}
                </p>
                <p className="mt-0.5 line-clamp-1 text-[11.5px] text-ink-500">
                  {ad.isGlobal
                    ? "Dikh raha hai: sabhi anjumans"
                    : ad.tenantIds.map(tenantName).join(", ") || "Koi anjuman select nahi"}
                </p>

                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-500">
                  <span className="inline-flex items-center gap-1">
                    <Eye className="h-3.5 w-3.5" />
                    {ad.impressions.toLocaleString("en-IN")} views
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <MousePointerClick className="h-3.5 w-3.5" />
                    {ad.clicks.toLocaleString("en-IN")} clicks
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <CalendarClock className="h-3.5 w-3.5" />
                    {ad.startsAt || ad.endsAt
                      ? `${ad.startsAt ? formatDate(ad.startsAt) : "ab"} → ${
                          ad.endsAt ? formatDate(ad.endsAt) : "kabhi bhi"
                        }`
                      : "Hamesha"}
                  </span>
                </div>

                <div className="mt-3 flex items-center gap-1.5">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setEditing(ad)}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={busyId === ad.id}
                    onClick={() => void handleToggle(ad)}
                  >
                    {ad.isActive ? "Pause" : "Publish"}
                  </Button>
                  <button
                    onClick={() => void handleDelete(ad)}
                    disabled={busyId === ad.id}
                    className="ml-auto rounded-lg p-2 text-ink-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Delete ad"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <div className="mt-5 rounded-2xl border border-brand-100 bg-brand-50/60 p-4 text-[11.5px] leading-relaxed text-brand-900">
        <b>Tip:</b> 1280×720 (YouTube thumbnail) image best rehti hai. Banner har panel ke
        top par 10 second ke liye dikhta hai, phir 3D flip ke saath agli ad par jaata hai.
        Anjuman ka naam/logo phir bhi pehla slide rehta hai. Images R2 par jaati hain aur 5 MB
        se badi file reject ho jaati hai.
      </div>

      <AdDrawer
        key={editing?.id ?? (creating ? "new" : "closed")}
        open={creating || !!editing}
        ad={editing}
        tenants={tenants}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => {
          setCreating(false);
          setEditing(null);
          void refresh();
        }}
      />
    </>
  );
}

/* ── Create / edit drawer ─────────────────────────────────────── */

function newDraftId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

/** Downscale huge uploads so a single ad can never eat the R2 quota. */
async function prepareAdImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Sirf image file chalegi (JPG / PNG / WebP)");
  }
  if (file.size > 5 * 1024 * 1024) {
    throw new Error("Image 5 MB se badi hai — chhoti file upload karein");
  }

  try {
    const bitmap = await createImageBitmap(file);
    const maxW = 1600;
    const maxH = 1600;
    if (bitmap.width <= maxW && bitmap.height <= maxH) {
      bitmap.close?.();
      return file;
    }
    const scale = Math.min(maxW / bitmap.width, maxH / bitmap.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9)
    );
    if (!blob) return file;
    return new File([blob], "ad-banner.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function AdDrawer({
  open,
  ad,
  tenants,
  onClose,
  onSaved,
}: {
  open: boolean;
  ad: Ad | null;
  tenants: Tenant[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [draftId] = useState(ad?.id ?? newDraftId());
  const [title, setTitle] = useState(ad?.title ?? "");
  const [imageUrl, setImageUrl] = useState(ad?.imageUrl ?? "");
  const [linkUrl, setLinkUrl] = useState(ad?.linkUrl ?? "");
  const [isGlobal, setIsGlobal] = useState(ad?.isGlobal ?? true);
  const [isActive, setIsActive] = useState(ad?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(ad?.sortOrder ?? 0));
  const [startsAt, setStartsAt] = useState(ad?.startsAt?.slice(0, 10) ?? "");
  const [endsAt, setEndsAt] = useState(ad?.endsAt?.slice(0, 10) ?? "");
  const [tenantIds, setTenantIds] = useState<string[]>(ad?.tenantIds ?? []);
  const [tenantSearch, setTenantSearch] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const visibleTenants = tenants.filter((t) =>
    t.name.toLowerCase().includes(tenantSearch.trim().toLowerCase())
  );

  async function handleFile(file: File | null | undefined) {
    if (!file) return;
    setUploading(true);
    try {
      const prepared = await prepareAdImage(file);
      const url = await uploadAdImage(prepared, draftId);
      setImageUrl(url);
      toast("Banner upload ho gaya");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Upload failed", "error");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function handleSave() {
    if (!title.trim()) {
      toast("Ad ka title likhein", "error");
      return;
    }
    if (!imageUrl) {
      toast("Pehle banner image upload karein", "error");
      return;
    }
    if (!isGlobal && tenantIds.length === 0) {
      toast("Kam se kam ek anjuman select karein", "error");
      return;
    }
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) {
      toast("Link https:// se shuru hona chahiye", "error");
      return;
    }
    if (startsAt && endsAt && startsAt > endsAt) {
      toast("Start date end date se pehle honi chahiye", "error");
      return;
    }

    setSaving(true);
    try {
      const input = {
        title,
        imageUrl,
        linkUrl: linkUrl || null,
        isGlobal,
        isActive,
        sortOrder: Number(sortOrder) || 0,
        startsAt: startsAt ? new Date(`${startsAt}T00:00:00`).toISOString() : null,
        endsAt: endsAt ? new Date(`${endsAt}T23:59:59`).toISOString() : null,
        tenantIds,
      };
      if (ad) {
        await updateAd(ad.id, input);
        toast("Ad update ho gaya");
      } else {
        await createAd(input);
        toast("Ad live ho gaya");
      }
      onSaved();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Save failed", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={ad ? "Edit ad" : "New ad"}
      subtitle="Banner har panel ke top par rotate hota hai"
      width="max-w-2xl"
      footer={
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11.5px] text-ink-500">
            {isGlobal ? "Sabhi anjumans ko dikhega" : `${tenantIds.length} anjuman ko dikhega`}
          </span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} loading={saving} disabled={saving || uploading}>
              <CheckCircle2 className="h-4 w-4" /> {ad ? "Save changes" : "Publish ad"}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Title" hint="Admin list aur screen reader ke liye." className="sm:col-span-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Ramadan donation drive"
            maxLength={120}
          />
        </Field>

        <div className="sm:col-span-2">
          <label className="label">Banner image (16:9)</label>
          {imageUrl ? (
            <div className="relative overflow-hidden rounded-xl border border-ink-200 bg-ink-100">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={imageUrl} alt="" className="aspect-[16/9] w-full object-cover" />
              <div className="absolute right-2 top-2 flex gap-1.5">
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="rounded-lg bg-white/90 px-2.5 py-1.5 text-[11.5px] font-medium text-ink-700 shadow-sm hover:bg-white"
                >
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => setImageUrl("")}
                  className="rounded-lg bg-white/90 p-1.5 text-ink-500 shadow-sm hover:bg-white hover:text-red-600"
                  aria-label="Remove image"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="flex aspect-[16/9] w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-ink-200 bg-ink-50/60 text-ink-500 transition hover:border-brand-300 hover:bg-brand-50/40 disabled:opacity-60"
            >
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              ) : (
                <ImagePlus className="h-7 w-7" />
              )}
              <span className="text-[12.5px] font-medium">
                {uploading ? "Upload ho raha hai…" : "Click to upload banner"}
              </span>
              <span className="text-[11px] text-ink-400">
                1280×720 recommended · JPG/PNG/WebP · max 5 MB
              </span>
            </button>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => void handleFile(e.target.files?.[0])}
          />
          <p className="mt-1 text-[12px] text-ink-500">
            Bade images automatically 1600px tak compress ho jaate hain — R2 quota bachane ke liye.
          </p>
        </div>

        <Field
          label="Click-through link (optional)"
          hint="https://… — ad click par naye tab me khulega."
          className="sm:col-span-2"
        >
          <Input
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            placeholder="https://youtube.com/watch?v=…"
            inputMode="url"
          />
        </Field>

        <Field label="Display order" hint="Chhota number pehle dikhta hai.">
          <Input
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value.replace(/[^\d-]/g, ""))}
            inputMode="numeric"
          />
        </Field>

        <Field label="Status">
          <div className="flex h-[42px] items-center rounded-xl border border-ink-200 px-3">
            <Switch checked={isActive} onChange={setIsActive} label={isActive ? "Live" : "Paused"} />
          </div>
        </Field>

        <Field label="Start date (optional)">
          <Input type="date" value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
        </Field>
        <Field label="End date (optional)">
          <Input type="date" value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
        </Field>
      </div>

      <div className="mt-5">
        <p className="mb-2 text-[12.5px] font-semibold text-ink-800">Audience</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setIsGlobal(true)}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
              isGlobal
                ? "border-brand-400 bg-brand-50/70 ring-2 ring-brand-500/15"
                : "border-ink-200 hover:border-ink-300"
            )}
          >
            <Globe2 className={cn("mt-0.5 h-4 w-4", isGlobal ? "text-brand-600" : "text-ink-400")} />
            <span>
              <span className="block text-[12.5px] font-medium text-ink-900">Global</span>
              <span className="block text-[11px] text-ink-500">Har anjuman ke panel me dikhega.</span>
            </span>
          </button>
          <button
            type="button"
            onClick={() => setIsGlobal(false)}
            className={cn(
              "flex items-start gap-2.5 rounded-xl border p-3 text-left transition",
              !isGlobal
                ? "border-brand-400 bg-brand-50/70 ring-2 ring-brand-500/15"
                : "border-ink-200 hover:border-ink-300"
            )}
          >
            <Users className={cn("mt-0.5 h-4 w-4", !isGlobal ? "text-brand-600" : "text-ink-400")} />
            <span>
              <span className="block text-[12.5px] font-medium text-ink-900">Selected anjumans</span>
              <span className="block text-[11px] text-ink-500">Sirf chuni hui committees ko.</span>
            </span>
          </button>
        </div>

        {!isGlobal && (
          <div className="mt-3 rounded-xl border border-ink-200">
            <div className="flex items-center gap-2 border-b border-ink-100 p-2.5">
              <SearchInput
                value={tenantSearch}
                onChange={setTenantSearch}
                placeholder="Anjuman dhundein…"
                className="flex-1"
              />
              <button
                type="button"
                onClick={() => setTenantIds(visibleTenants.map((t) => t.id))}
                className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-brand-700 hover:bg-brand-50"
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setTenantIds([])}
                className="rounded-lg px-2 py-1 text-[11.5px] font-medium text-ink-500 hover:bg-ink-50"
              >
                None
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto p-1.5">
              {visibleTenants.length === 0 && (
                <p className="px-2 py-4 text-center text-[12px] text-ink-500">
                  Koi anjuman nahi mili.
                </p>
              )}
              {visibleTenants.map((t) => {
                const checked = tenantIds.includes(t.id);
                return (
                  <label
                    key={t.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 hover:bg-ink-50"
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) =>
                        setTenantIds((prev) =>
                          e.target.checked
                            ? Array.from(new Set([...prev, t.id]))
                            : prev.filter((id) => id !== t.id)
                        )
                      }
                      className="h-4 w-4 rounded border-ink-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-500 text-[10px] font-semibold text-white">
                      {t.logoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.logoUrl} alt="" className="h-full w-full bg-white object-contain" />
                      ) : (
                        t.code
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-ink-800">
                        {t.name}
                      </span>
                      <span className="block truncate text-[11px] text-ink-500">
                        {t.village}, {t.district}
                      </span>
                    </span>
                    {checked && <CheckCircle2 className="h-4 w-4 shrink-0 text-brand-600" />}
                  </label>
                );
              })}
            </div>
            <div className="border-t border-ink-100 px-3 py-2 text-[11px] text-ink-500">
              {tenantIds.length} anjuman selected
            </div>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-start gap-2 rounded-xl border border-ink-200 bg-ink-50/70 p-3 text-[11.5px] leading-relaxed text-ink-600">
        <BarChart3 className="mt-0.5 h-4 w-4 shrink-0 text-ink-400" />
        <span>
          Views aur clicks automatically count hote hain. Ad rotate hoti hai: pehle anjuman
          ka naam/logo 10 second, phir har ad 10 second.
        </span>
      </div>

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-brand-100 bg-brand-50/60 p-3 text-[11.5px] leading-relaxed text-brand-900">
        <Building2 className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
        <span>
          Selected anjumans wali ad sirf unhi ke members/office bearers ko dikhegi. Har
          anjuman ka data alag rehta hai — RLS ise enforce karta hai.
        </span>
      </div>

      {ad && (
        <div className="mt-3 flex items-center gap-3 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1">
            <ExternalLink className="h-3.5 w-3.5" />
            {ad.linkUrl ? "Link set" : "No link"}
          </span>
          <span>Created {formatDate(ad.createdAt)}</span>
        </div>
      )}
    </Drawer>
  );
}
