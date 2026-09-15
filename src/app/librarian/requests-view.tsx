"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCheck, Inbox, User, XCircle } from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatusBanner, type Status } from "@/components/status-banner";

interface RequestItem {
  id: string;
  status: "PENDING" | "ISSUED" | "DECLINED";
  comment: string | null;
  createdAt: string;
  handledAt: string | null;
  student: {
    id: string;
    lastName: string;
    firstName: string;
    className: string | null;
  };
  book: { id: string; isbn: string; title: string; subject: string };
  handledBy: string | null;
}

export default function RequestsView() {
  const [pending, setPending] = useState<RequestItem[]>([]);
  const [history, setHistory] = useState<RequestItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "info", message: null });

  const flash = (kind: Status["kind"], message: string) =>
    setStatus({ kind, message });

  const load = useCallback(async () => {
    const [p, all] = await Promise.all([
      fetch("/api/requests?status=PENDING").then((r) => (r.ok ? r.json() : [])).catch(() => []),
      fetch("/api/requests?limit=25").then((r) => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    setPending((p ?? []) as RequestItem[]);
    setHistory(((all ?? []) as RequestItem[]).filter((r) => r.status !== "PENDING").slice(0, 20));
  }, []);

  useEffect(() => {
    load().finally(() => setLoading(false));
  }, [load]);

  const act = async (id: string, kind: "fulfill" | "decline", title: string) => {
    if (kind === "decline" && !confirm(`Отказать по заявке на «${title}»?`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/requests/${id}/${kind}`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error ?? "Ошибка операции");
      if (kind === "fulfill") {
        flash(
          "success",
          json?.alreadyIssued
            ? `«${title}» уже была выдана — заявка закрыта.`
            : `«${title}» выдана.`
        );
      } else {
        flash("success", `Заявка на «${title}» отклонена.`);
      }
      load();
    } catch (e) {
      flash("error", e instanceof Error ? e.message : "Ошибка операции");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <StatusBanner
        status={status}
        onClear={() => setStatus({ kind: "info", message: null })}
      />

      <Card>
        <CardHeader className="py-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Inbox className="h-4 w-4 text-primary" />
            Заявки учеников
            {pending.length > 0 && <Badge variant="warning">{pending.length}</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}
          {!loading && pending.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Нет ожидающих заявок. 🎉
            </p>
          )}
          {!loading && pending.length > 0 && (
            <ul className="divide-y divide-border">
              {pending.map((r) => (
                <li key={r.id} className="flex items-start gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      {r.book.title}
                      <span className="font-normal text-muted-foreground">
                        {" "}· {r.book.subject}
                      </span>
                    </p>
                    <Link
                      href={`/student?id=${r.student.id}`}
                      className="mt-0.5 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                    >
                      <User className="h-3 w-3" />
                      {r.student.lastName} {r.student.firstName}
                      {r.student.className ? ` · ${r.student.className}` : ""}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Заявка от {new Date(r.createdAt).toLocaleDateString("ru-RU")}
                      {r.comment ? ` · «${r.comment}»` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1.5">
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => act(r.id, "fulfill", r.book.title)}
                    >
                      <CheckCheck className="mr-1 h-3.5 w-3.5" /> Выдать
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-destructive hover:bg-destructive/10 hover:text-destructive"
                      disabled={busy}
                      onClick={() => act(r.id, "decline", r.book.title)}
                    >
                      <XCircle className="mr-1 h-3.5 w-3.5" /> Отказать
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {history.length > 0 && (
        <Card>
          <CardHeader className="py-3">
            <CardTitle className="text-base">Недавно выполненные</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-border">
              {history.map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.book.title}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {r.student.lastName} {r.student.firstName}
                      {r.student.className ? ` (${r.student.className})` : ""}
                      {r.handledAt &&
                        ` · ${new Date(r.handledAt).toLocaleDateString("ru-RU")}`}
                      {r.handledBy ? ` · ${r.handledBy}` : ""}
                    </p>
                  </div>
                  <Badge variant={r.status === "ISSUED" ? "secondary" : "destructive"}>
                    {r.status === "ISSUED" ? "Выдана" : "Отказ"}
                  </Badge>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
