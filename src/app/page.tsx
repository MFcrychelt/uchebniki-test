import Link from "next/link";
import {
  ArrowRight,
  BookOpen,
  ClipboardList,
  Printer,
  QrCode,
  ScanLine,
  Users,
} from "lucide-react";
import { Eyebrow, Panel, PanelField } from "@/components/ui/panel";
import { VersionBadge } from "@/components/version-badge";
import { ThemeToggle } from "@/components/theme";
import { AccessibilityGear } from "@/components/accessibility";
import { InstallHint } from "@/components/install-hint";
import { LogoMark } from "@/components/ui/logo-mark";

/**
 * Главная — «вход» в приложение, а не лендинг-витрина.
 *
 * Композиция взята с fermi.gg: светлый нейтральный холст, ОДНА насыщенная
 * панель с крупным белым заголовком, внутри неё — поля и главный жест;
 * всё остальное (шаги, вопросы) — спокойные карточки на том же холсте.
 *
 * Про скорость на слабых устройствах:
 *  - страница серверная и статическая: 0 КБ своего JS, ни одного запроса к БД;
 *  - ноль изображений и веб-шрифтов (только системный стек);
 *  - decorative blur/glow удалён: был `blur-3xl`-круг, который на дешёвом
 *    Android стоит перерисовки всего слоя при каждом скролле.
 */

const roles = [
  {
    href: "/student",
    icon: QrCode,
    title: "Ученик",
    role: "личный кабинет",
    description:
      "Список учебников класса на год, что уже на руках и чего не хватает. Книги вы берёте с полки сами — по своему списку.",
  },
  {
    href: "/librarian",
    icon: ScanLine,
    title: "Библиотекарь",
    role: "панель сотрудника",
    description:
      "Сверяете по карточке: открыли ученика по QR — отметили, что он реально принёс. Долги, журнал и отчёты рядом.",
  },
  {
    href: "/admin",
    icon: Users,
    title: "Администратор",
    role: "настройки",
    description:
      "Классы и ученики, каталог учебников, карточки для входа, журнал действий.",
  },
];

/* Порядок показан так, как он устроен в школе: ребёнок сам набирает учебники
   с полки, а сотрудник на выдаче сверяет комплект по карточке. Приложение
   фиксирует состав, а не заменяет выдачу «через прилавок». */
const steps = [
  {
    icon: Users,
    title: "Подготовка",
    text: "Администратор заводит классы и каталог учебников, каждому ученику выдаётся карточка с QR-кодом.",
  },
  {
    icon: BookOpen,
    title: "Ученик собирает сам",
    text: "В кабинете видно список класса, что уже на руках и чего не хватает — нужные книги ученик берёт с полки сам.",
  },
  {
    icon: ScanLine,
    title: "Библиотекарь сверяет по QR",
    text: "Сканировали карточку ученика — его список открыт: отметьте принесённое по ISBN или «выдать всё», расхождение видно сразу.",
  },
  {
    icon: ClipboardList,
    title: "Учёт и возврат",
    text: "Каждая операция — в журнале: кто, какую книгу и когда. В конце года видно, что не вернули; приём и списание в пару касаний.",
  },
];

const faq = [
  {
    q: "Кто набирает книги с полки?",
    a: "Ученик сам: в личном кабинете у него список класса, отметки «выдано» и «запрошено», остаток на складе. Приложение нужно, чтобы состав был зафиксирован, — поэтому на выдаче сотрудник сканирует QR ученика и сверяет комплект, а не носит книги по классам.",
  },
  {
    q: "Потерял карточку с QR-кодом",
    a: "Зайдите по логину и паролю (их выдаёт библиотекарь) или попросите у учителя одноразовую ссылку ещё раз. Карточку можно распечатать снова из кабинета.",
  },
  {
    q: "Зачем вписывать фамилию в книгу?",
    a: "Подпись в конце книги остаётся главным доказательством, что учебник ваш: по ней библиотекарь принимает возврат в конце года.",
  },
  {
    q: "Штрихкод книги не читается",
    a: "Отойдите на ладонь: камера ловит код целиком вместе с полем вокруг. Если блик — переверните книгу; если и так не выходит, введите ISBN в поле под кнопками.",
  },
  {
    q: "Нужно оформить весь класс за минуту",
    a: "Сканируйте QR ученика и нажмите «Выдать всё» — список класса отмечен разом, лишнее потом снимается одной галочкой. Так класс проходит за один подход, а не по одной книге.",
  },
];

export default function Home() {
  return (
    <main className="safe-x mx-auto flex min-h-dvh w-full max-w-4xl flex-col pt-2 pb-10">
      {/* Кнопки — в потоке документа, не поверх шапки: иначе на телефоне
          заголовок перехватывает тап (абсолютный слой + blur). */}
      <div className="mb-3 flex justify-end gap-1">
        <ThemeToggle />
        <AccessibilityGear />
      </div>

      {/* ------------------------------ HERO ------------------------------ */}
      <Panel
        eyebrow="Школьная библиотека · учёт учебников"
        // Знак библиотеки — тот же, что на обоих экранах входа:
        // главная и вход должны читаться как одно приложение.
        right={<LogoMark size="lg" />}
        title={
          <>
            Выдача учебников —
            <br className="hidden sm:block" /> в одно касание
          </>
        }
        // Начертание задаёт Panel (semibold + лёгкое сжатие трекинга):
        // заголовок должен читаться как шапка рабочего экрана, а не плакат.
        titleClassName="text-[1.65rem] sm:text-[2rem] leading-[1.22]"
        subtitle="Что выдано, что на руках и кто не вернул — видно сразу, без бумажного журнала и длинных форм."
        footer={
          <div className="flex flex-wrap gap-2">
            {roles.map((r, i) => (
              <Link
                key={r.href}
                href={r.href}
                className="panel-field group flex min-h-16 flex-1 basis-full items-center gap-3 p-3.5 text-left transition-[background-color,transform] duration-100 hover:bg-white/20 active:scale-[0.99] sm:basis-0"
              >
                <span className="num flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white/15 text-sm font-bold text-panel-foreground">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <r.icon className="h-4 w-4 shrink-0" aria-hidden />
                    <span className="truncate text-base font-semibold">{r.title}</span>
                    <span className="eyebrow hidden text-panel-muted sm:inline">
                      {r.role}
                    </span>
                  </span>
                  <span className="panel-muted mt-0.5 block text-xs leading-snug sm:text-sm">
                    {r.description}
                  </span>
                </span>
                <ArrowRight
                  className="h-5 w-5 shrink-0 text-panel-muted transition-transform duration-150 group-hover:translate-x-0.5"
                  aria-hidden
                />
              </Link>
            ))}
          </div>
        }
      />

      {/* -------------------------- КАК ЭТО РАБОТАЕТ -------------------------- */}
      <section className="mt-10">
        <Eyebrow className="text-primary">Как это работает</Eyebrow>
        <h2 className="mt-1 text-xl sm:text-[1.5rem]">
          Ученик собирает книги сам — сотрудник сверяет по QR
        </h2>
        <ol className="mt-4 grid gap-2 sm:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title}>
              {/* Статичная карточка: ни теней, ни hover-подъёмов — на
                  300-строчных экранах это тот же вид, что и у ферми, но
                  без перерисовки слоёв. */}
              <div className="flex h-full gap-3.5 rounded-lg border border-border bg-card p-4">
                <span className="num text-xl font-semibold leading-none text-primary/55">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 font-semibold leading-snug">
                    <step.icon className="h-4 w-4 shrink-0 text-primary" aria-hidden />
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* ------------------------------ ЧТО ВНУТРИ ------------------------------ */}
      <section className="mt-8 grid gap-2 sm:grid-cols-3">
        {[
          {
            icon: QrCode,
            title: "QR вместо фамилий",
            text: "Ученик показывает карточку — и его список открыт: кто он и что ему положено, без тетради на ресепшене.",
          },
          {
            icon: Printer,
            title: "Печать карточек",
            text: "Класс целиком на листе А4: карточки с кодом вырезаются и раздаются за 10 минут.",
          },
          {
            icon: ScanLine,
            title: "Штрихкод книги",
            text: "ISBN с обложки ставит галочку сам — так быстрее сверять то, что ученик принёс, и то, что он отнёс обратно.",
          },
        ].map((f) => (
          <div
            key={f.title}
            className="rounded-lg border border-border bg-card p-4"
          >
            <f.icon className="h-5 w-5 text-primary" aria-hidden />
            <p className="mt-2 font-semibold leading-snug">{f.title}</p>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              {f.text}
            </p>
          </div>
        ))}
      </section>

      {/* ------------------------------ ЧАСТЫЕ ВОПРОСЫ ------------------------------ */}
      <section className="mt-8">
        <Eyebrow className="text-primary">Частые вопросы</Eyebrow>
        <PanelField className="mt-3 overflow-hidden p-0">
          <ul>
            {faq.map((item) => (
              <li key={item.q} className="border-b border-border last:border-b-0">
                {/* Нативные details/summary: аккордеон без единого байта JS
                    и без анимации высоты — на слабом телефоне не лагает. */}
                <details className="group">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span
                      aria-hidden
                      className="num shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-45"
                    >
                      +
                    </span>
                  </summary>
                  <p className="px-4 pb-4 text-sm leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </details>
              </li>
            ))}
          </ul>
        </PanelField>
        <div className="mt-3">
          <InstallHint />
        </div>
      </section>

      <footer className="mt-10 flex flex-col items-center gap-1.5 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center justify-center gap-1.5">
          Next.js · PostgreSQL · Prisma 8
          <VersionBadge className="num flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5" />
        </p>
        <p>Сделано для школьной библиотеки</p>
      </footer>
    </main>
  );
}
