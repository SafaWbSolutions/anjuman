"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    const isAuthed =
      typeof window !== "undefined" &&
      window.localStorage.getItem("anjuman.session") !== null;
    router.replace(isAuthed ? "/dashboard/" : "/login/");
  }, [router]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-ink-50">
      <div className="flex flex-col items-center gap-3 text-ink-500">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-lg">
          <span className="text-xl font-bold">ا</span>
        </div>
        <Loader2 className="h-5 w-5 animate-spin" />
        <p className="text-sm">Loading Anjuman…</p>
      </div>
    </div>
  );
}
