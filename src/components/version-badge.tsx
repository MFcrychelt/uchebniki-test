"use client";

import { useEffect, useState } from "react";

interface GitVersion {
  short: string;
  full: string;
  subject: string;
  branch: string;
  date: string;
}

/**
 * Небольшой бейдж версии сборки (git-хеш). Статическая страница
 * (главная) остаётся статикой для офлайн-PWA: версия догружается
 * клиентом из /api/version.
 */
export function VersionBadge({ className }: { className?: string }) {
  const [short, setShort] = useState<string | null>(null);
  const [subject, setSubject] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/version")
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { version?: GitVersion | null }) => {
        if (j?.version) {
          setShort(j.version.short);
          setSubject(j.version.subject);
        }
      })
      .catch(() => {});
  }, []);

  if (!short) return null;

  return (
    <span
      className={className}
      title={`${subject} (${short})`}
    >
      <span className="font-mono">{short}</span>
    </span>
  );
}
