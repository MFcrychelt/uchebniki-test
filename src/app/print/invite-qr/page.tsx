"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import PrintToolbar from "../toolbar";
import "../print.css";
import "../qr-cards/qr-cards.css";

interface InviteStudent {
  id: string;
  lastName: string;
  firstName: string;
  inviteToken: string | null;
  inviteUsedAt: string | null;
  classId: string | null;
  class: { id: string; name: string } | null;
}

interface QrClass {
  id: string;
  name: string;
}

/**
 * QR-карты с одноразовыми magic links (/invite/<токен>) для раздачи
 * ученикам на классном часу. Только персонал: список имён не публичен.
 */
function InviteQrInner() {
  const searchParams = useSearchParams();
  const [selectedClass, setSelectedClass] = useState(searchParams.get("classId") ?? "");
  const [classes, setClasses] = useState<QrClass[]>([]);
  const [students, setStudents] = useState<InviteStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);

  useEffect(() => {
    setLoading(true);
    setAccessDenied(false);
    fetch("/api/classes")
      .then((r) => (r.ok ? r.json() : []))
      .then((data) => setClasses((data as QrClass[]).map((c) => ({ id: c.id, name: c.name }))))
      .catch(() => {});
    const params = selectedClass ? `?classId=${selectedClass}` : "";
    fetch(`/api/students${params}`)
      .then(async (r) => {
        if (r.status === 401) {
          setAccessDenied(true);
          return [];
        }
        if (!r.ok) return [];
        return r.json();
      })
      .then((data) => {
        setStudents(
          (data as InviteStudent[])
            .filter((s) => s.inviteToken && s.class)
            .sort((a, b) =>
              (a.class!.name + a.lastName).localeCompare(b.class!.name + b.lastName, "ru")
            )
        );
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [selectedClass]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const today = new Date().toLocaleDateString("ru-RU");

  const byClass = useMemo(() => {
    const map = new Map<string, InviteStudent[]>();
    for (const s of students) {
      if (!s.class) continue;
      const key = s.class.name;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0], "ru"));
  }, [students]);

  return (
    <main className="print-page">
      <PrintToolbar backHref="/admin" />

      <h1>Ссылки для входа в кабинет</h1>
      <p className="print-subtitle">
        {selectedClass ? "Один класс" : "Все классы"} · {students.length} карт ·
        каждая ссылка одноразовая
      </p>

      <div className="no-print mb-4">
        <Card>
          <CardContent className="flex flex-wrap items-center gap-2 p-3">
            <select
              value={selectedClass}
              onChange={(e) => {
                setSelectedClass(e.target.value);
                const q = new URLSearchParams();
                if (e.target.value) q.set("classId", e.target.value);
                const qs = q.toString();
                window.history.replaceState(null, "", qs ? `/print/invite-qr?${qs}` : "/print/invite-qr");
              }}
              className="h-9 rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="">Все классы</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <Link href="/admin" className="text-sm text-muted-foreground hover:text-foreground">
              К администратору
            </Link>
          </CardContent>
        </Card>
      </div>

      <p className="no-print mb-4 text-sm text-muted-foreground">
        Ученик наводит камеру на QR (или по ссылке) — и попадает в личный
        кабинет. Срабатывает только один раз: после первого входа карта
        больше не работает.
      </p>

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && accessDenied && (
        <p className="text-sm text-muted-foreground">
          Список учеников доступен только персоналу библиотеки.{" "}
          <Link href="/login" className="text-primary underline">
            Войти
          </Link>
        </p>
      )}

      {!loading && !accessDenied && students.length === 0 && (
        <p className="text-sm text-muted-foreground">
          Ссылок пока нет: создайте их во вкладке «Ссылки» админки
          («Создать для всех без ссылок»).{" "}
          <Link href="/admin" className="text-primary underline">
            К администратору
          </Link>
        </p>
      )}

      {!loading &&
        byClass.map(([className, list]) => (
          <section key={className} className="mb-6">
            <h2 className="no-print mb-2 text-sm font-semibold text-muted-foreground">
              {className}
            </h2>
            <div className="qrcard-grid">
              {list.map((s) => {
                const used = Boolean(s.inviteUsedAt);
                return (
                  <div key={s.id} className={`qr-card${used ? " qr-card-used" : ""}`}>
                    <div className="qr-box">
                      <QRCodeSVG
                        value={`${origin}/invite/${s.inviteToken}`}
                        size={96}
                        level="M"
                      />
                    </div>
                    <div>
                      <p className="qr-name">
                        {s.lastName} {s.firstName}
                      </p>
                      <p className="qr-class">{s.class!.name}</p>
                      <p className="qr-foot">
                        {used ? "Ссылка уже использована" : `Вход в кабинет · ${today}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
    </main>
  );
}

export default function InviteQrPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center">
          <p className="text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <InviteQrInner />
    </Suspense>
  );
}
