"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import PrintToolbar from "../toolbar";
import "../print.css";
import "./qr-cards.css";

interface QrStudent {
  id: string;
  lastName: string;
  firstName: string;
  qrToken: string | null;
  classId: string | null;
  class: { id: string; name: string } | null;
}

interface QrClass {
  id: string;
  name: string;
}

function QrCardsInner() {
  const searchParams = useSearchParams();
  // «Моя карточка»: по личному QR-ключу (?qr=) — публично, один ученик.
  const qr = searchParams.get("qr") ?? "";
  // Локальное состояние: URL-параметр — точка входа (ссылка из админки),
  // селектор дальше меняет его сам (useSearchParams на replaceState не реагирует).
  const [selectedClass, setSelectedClass] = useState(searchParams.get("classId") ?? "");
  const [classes, setClasses] = useState<QrClass[]>([]);
  const [students, setStudents] = useState<QrStudent[]>([]);
  const [loading, setLoading] = useState(true);
  const [accessDenied, setAccessDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);

  const isMyCard = Boolean(qr);

  // «Моя карточка»: один ученик по QR-ключу (публичный endpoint).
  useEffect(() => {
    if (!isMyCard) return;
    setLoading(true);
    fetch(`/api/student/qr/${qr}`)
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((p: { student: QrStudent & { class: { id: string; name: string } | null } }) => {
        setStudents([p.student]);
        setNotFound(false);
      })
      .catch(() => {
        setStudents([]);
        setNotFound(true);
      })
      .finally(() => setLoading(false));
  }, [qr, isMyCard]);

  // Все / один класс — только для персонала (список имён не публичен).
  useEffect(() => {
    if (isMyCard) return;
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
          (data as QrStudent[])
            .filter((s) => s.class)
            .sort((a, b) =>
              (a.class!.name + a.lastName).localeCompare(b.class!.name + b.lastName, "ru")
            )
        );
      })
      .catch(() => setStudents([]))
      .finally(() => setLoading(false));
  }, [selectedClass, isMyCard]);

  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const today = new Date().toLocaleDateString("ru-RU");

  const byClass = useMemo(() => {
    const map = new Map<string, QrStudent[]>();
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
      <PrintToolbar backHref={isMyCard ? "/student" : "/admin"} />

      <h1>QR-карточки учеников</h1>
      <p className="print-subtitle">
        {isMyCard
          ? "Моя карточка"
          : selectedClass
            ? "Один класс"
            : "Все классы"}{" "}
        · {students.length} карточек
      </p>

      {!isMyCard && (
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
                  window.history.replaceState(null, "", qs ? `/print/qr-cards?${qs}` : "/print/qr-cards");
                }}
                className="h-11 rounded-lg border border-input bg-card px-2 text-base"
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
      )}

      {loading && <p className="text-sm text-muted-foreground">Загрузка…</p>}

      {!loading && accessDenied && (
        <p className="text-sm text-muted-foreground">
          Список учеников доступен только персоналу библиотеки.{" "}
          <Link href="/login" className="text-primary underline">
            Войти
          </Link>
        </p>
      )}

      {!loading && notFound && (
        <p className="text-sm text-muted-foreground">
          Карточка не найдена: проверьте QR-код.{" "}
          <Link href="/student" className="text-primary underline">
            В кабинет
          </Link>
        </p>
      )}

      {!loading && !accessDenied && !notFound && students.length === 0 && !isMyCard && (
        <p className="text-sm text-muted-foreground">
          Ученики не найдены.{" "}
          <Link href="/admin" className="text-primary underline">
            Добавить учеников
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
              {list.map((s) => (
                <div key={s.id} className="qr-card">
                  <div className="qr-box">
                    <QRCodeSVG
                      value={`${origin}/student?qr=${s.qrToken ?? s.id}`}
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
                      Школьная библиотека · {today}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))}
    </main>
  );
}

export default function QrCardsPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-dvh items-center justify-center">
          <p className="text-muted-foreground">Загрузка…</p>
        </main>
      }
    >
      <QrCardsInner />
    </Suspense>
  );
}
