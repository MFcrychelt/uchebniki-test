"use client";

import { useEffect, useState } from "react";
import { BookOpen, ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export function coverSrc(bookId: string, v?: number) {
  return `/api/books/${bookId}/cover${v ? `?v=${v}` : ""}`;
}

/** Миниатюра: прячет себя, если обложки нет. */
export function BookCover({
  bookId,
  title,
  className,
  size = "sm",
  version = 0,
}: {
  bookId: string;
  title?: string;
  className?: string;
  size?: "sm" | "md" | "lg";
  version?: number;
}) {
  const [ok, setOk] = useState(true);
  useEffect(() => setOk(true), [bookId, version]);
  const box =
    size === "lg"
      ? "h-36 w-24"
      : size === "md"
        ? "h-16 w-11"
        : "h-12 w-8";
  if (!ok) {
    return (
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded bg-muted text-muted-foreground",
          box,
          className
        )}
        aria-hidden
      >
        <BookOpen className="h-4 w-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={coverSrc(bookId, version)}
      alt={title ? `Обложка: ${title}` : ""}
      onError={() => setOk(false)}
      className={cn(
        "shrink-0 rounded object-cover bg-muted",
        box,
        className
      )}
    />
  );
}

/** Загрузка обложки: файл с телефона или по ISBN. */
export function CoverUploader({
  bookId,
  isbn,
  onDone,
}: {
  bookId: string;
  isbn?: string;
  onDone?: () => void;
}) {
  const [v, setV] = useState(0);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const bump = () => {
    setV((n) => n + 1);
    onDone?.();
  };

  const send = async (body: FormData | string) => {
    setBusy(true);
    setErr(null);
    try {
      const r = await fetch(`/api/books/${bookId}/cover`, {
        method: "POST",
        body:
          typeof body === "string"
            ? JSON.stringify({ source: "isbn" })
            : body,
        headers:
          typeof body === "string"
            ? { "Content-Type": "application/json" }
            : undefined,
      });
      const json = await r.json().catch(() => null);
      if (!r.ok) throw new Error(json?.error ?? "Не удалось загрузить");
      bump();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Ошибка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-center">
      <BookCover bookId={bookId} size="lg" version={v} />
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <label className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-md border border-border bg-card px-3 text-sm font-medium">
          <ImagePlus className="h-4 w-4" />
          {busy ? "Загрузка…" : "С телефона / файла"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp,image/*"
            capture="environment"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              const fd = new FormData();
              fd.set("file", f);
              void send(fd);
            }}
          />
        </label>
        <Button
          type="button"
          variant="outline"
          className="h-11"
          disabled={busy || !isbn}
          onClick={() => void send("isbn")}
        >
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Найти по ISBN
        </Button>
        <Button
          type="button"
          variant="ghost"
          className="h-10 text-destructive"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await fetch(`/api/books/${bookId}/cover`, { method: "DELETE" });
            setBusy(false);
            bump();
          }}
        >
          Убрать обложку
        </Button>
        {err && <p className="text-xs text-destructive">{err}</p>}
      </div>
    </div>
  );
}
