"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Check, Copy, ExternalLink, KeyRound, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ClassInfo } from "@/lib/types";

interface InviteRow {
  id: string;
  lastName: string;
  firstName: string;
  login: string | null;
  inviteToken: string | null;
  inviteUsedAt: string | null;
  class: ClassInfo | null;
}

/**
 * «Ссылки для раздачи»: одноразовые magic links (/invite/<токен>) —
 * учитель копирует ссылки в мессенджер или печатает QR-карты.
 * Ссылка срабатывает один раз: ставит ученику cookie-ессию на 30 дней.
 */
export default function InviteLinksView() {
  const [students, setStudents] = useState<InviteRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const origin = typeof window !== "undefined" ? window.location.origin : "";

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/students");
      if (!res.ok) {
        setError("Не удалось загрузить список учеников.");
        setStudents([]);
      } else {
        const data = (await res.json()) as InviteRow[];
        setStudents(
          data.sort((a, b) =>
            `${a.class?.name ?? ""} ${a.lastName}`.localeCompare(
              `${b.class?.name ?? ""} ${b.lastName}`,
              "ru"
            )
          )
        );
        setError(null);
      }
    } catch {
      setError("Ошибка сети.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const withLink = useMemo(
    () => students.filter((s) => s.inviteToken),
    [students]
  );
  const withoutLink = students.length - withLink.length;
  const active = withLink.filter((s) => !s.inviteUsedAt);

  const copyText = async (text: string): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  };

  const copyOne = async (s: InviteRow) => {
    if (!s.inviteToken) return;
    if (await copyText(`${origin}/invite/${s.inviteToken}`)) {
      setCopiedId(s.id);
      setTimeout(() => setCopiedId(null), 1500);
    }
  };

  const copyAll = async () => {
    const lines = active
      .map((s) => `${s.lastName} ${s.firstName} (${s.class?.name ?? "б/к"}) — ${origin}/invite/${s.inviteToken}`)
      .join("\n");
    if (lines && (await copyText(lines))) {
      setCopiedAll(true);
      setTimeout(() => setCopiedAll(false), 2000);
    }
  };

  const createForAll = async () => {
    setBusy(true);
    setNotice(null);
    setError(null);
    try {
      const res = await fetch("/api/students/invite-links", { method: "POST" });
      const j = (await res.json()) as { created?: number; error?: string };
      if (!res.ok) setError(j.error ?? "Не удалось создать ссылки");
      else {
        setNotice(`Ссылок создано: ${j.created ?? 0}.`);
        refresh();
      }
    } catch {
      setError("Ошибка сети.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyRound className="h-5 w-5 text-primary" />
            Ссылки для раздачи (magic links)
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Каждому ученику — своя одноразовая ссылка: открыл (со своего
            телефона, из мессенджера или по QR) — и в кабинете. Ссылка
            срабатывает один раз и ставит ученику сессию на 30 дней.
            Логин и пароль для будущих входов видны ученику в кабинете.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              size="sm"
              onClick={copyAll}
              disabled={active.length === 0}
            >
              {copiedAll ? (
                <Check className="mr-1 h-4 w-4 text-emerald-600" />
              ) : (
                <Copy className="mr-1 h-4 w-4" />
              )}
              Скопировать все активные ({active.length})
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={createForAll}
              disabled={busy || withoutLink === 0}
            >
              {busy ? "Создаём…" : `Создать для всех без ссылок (${withoutLink})`}
            </Button>
            <Link href="/print/invite-qr" target="_blank">
              <Button size="sm" variant="outline">
                <Printer className="mr-1 h-4 w-4" />
                Печать QR-карт
                <ExternalLink className="ml-1 h-3.5 w-3.5" />
              </Button>
            </Link>
          </div>
          {notice && (
            <p className="text-sm text-emerald-700">{notice}</p>
          )}
          {error && <p className="text-sm text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Загрузка…</p>
          ) : students.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">
              Учеников пока нет — импортируйте класс во вкладке «Импорт».
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th className="px-4 py-2 font-medium">Ученик</th>
                    <th className="px-4 py-2 font-medium">Класс</th>
                    <th className="px-4 py-2 font-medium">Логин</th>
                    <th className="px-4 py-2 font-medium">Ссылка</th>
                    <th className="px-4 py-2 font-medium">Статус</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {students.map((s) => (
                    <tr key={s.id} className="border-b last:border-0">
                      <td className="px-4 py-2 font-medium">
                        {s.lastName} {s.firstName}
                      </td>
                      <td className="px-4 py-2">{s.class?.name ?? "—"}</td>
                      <td className="px-4 py-2 font-mono text-xs">
                        {s.login ?? "—"}
                      </td>
                      <td className="max-w-56 truncate px-4 py-2 font-mono text-xs text-muted-foreground">
                        {s.inviteToken
                          ? `${origin}/invite/${s.inviteToken.slice(0, 8)}…`
                          : "—"}
                      </td>
                      <td className="px-4 py-2">
                        {s.inviteToken ? (
                          s.inviteUsedAt ? (
                            <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                              Использована
                            </span>
                          ) : (
                            <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-800">
                              Активна
                            </span>
                          )
                        ) : (
                          <span className="text-xs text-muted-foreground">
                            Нет
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!s.inviteToken || Boolean(s.inviteUsedAt)}
                          onClick={() => copyOne(s)}
                          title={
                            s.inviteUsedAt
                              ? "Ссылка уже использована"
                              : "Копировать ссылку"
                          }
                        >
                          {copiedId === s.id ? (
                            <Check className="h-4 w-4 text-emerald-600" />
                          ) : (
                            <Copy className="h-4 w-4" />
                          )}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
