import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Library,
  QrCode,
  ScanLine,
  ShieldCheck,
  Undo2,
  Users,
  Zap,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { VersionBadge } from "@/components/version-badge";
import { ThemeToggle } from "@/components/theme";
import { AccessibilityGear } from "@/components/accessibility";

const sections = [
  {
    href: "/student",
    icon: QrCode,
    title: "Ученик",
    role: "личный кабинет",
    description:
      "Ваш список учебников на год, история выдачи и заявки на книги. Вход — по ссылке от учителя, логину или QR-коду.",
    color: "bg-blue-50 text-blue-600 dark:bg-blue-950 dark:text-blue-300",
  },
  {
    href: "/librarian",
    icon: ScanLine,
    title: "Библиотекарь",
    role: "панель сотрудника",
    description:
      "Откройте ученика по QR-коду и отмечайте книги галочками. Долги, журнал и отчёты — под рукой.",
    color:
      "bg-emerald-50 text-emerald-600 dark:bg-emerald-950 dark:text-emerald-300",
  },
  {
    href: "/admin",
    icon: Users,
    title: "Администратор",
    role: "настройки",
    description:
      "Классы и ученики, каталог учебников, карточки для входа и журнал всех действий.",
    color:
      "bg-violet-50 text-violet-600 dark:bg-violet-950 dark:text-violet-300",
  },
];

const steps = [
  {
    icon: Users,
    title: "Подготовка",
    text: "Администратор заводит классы и каталог учебников, каждому ученику выдаётся карточка с QR-кодом.",
  },
  {
    icon: ScanLine,
    title: "Выдача",
    text: "Библиотекарь сканирует QR ученика и отмечает книги — поштучно по ISBN или все сразу.",
  },
  {
    icon: ClipboardList,
    title: "Учёт",
    text: "Каждая операция попадает в журнал: кто, какую книгу и когда. Данные не теряются и всегда под рукой.",
  },
  {
    icon: Undo2,
    title: "Возврат",
    text: "В конце года по каждому ученику видны невозвращённые книги — приём и списание в пару касаний.",
  },
];

export default function Home() {
  return (
    <main className="relative mx-auto flex min-h-screen max-w-5xl flex-col px-4 py-6 sm:py-14">
      {/* Кнопки в потоке документа, не поверх шапки: иначе на телефоне
          заголовок перехватывает тап (абсолютный слой + blur). */}
      <div className="relative z-50 mb-2 flex justify-end gap-0.5">
        <ThemeToggle />
        <AccessibilityGear />
      </div>
      {/* --- Шапка --- */}
      <header className="relative mb-12 flex flex-col items-center text-center sm:mb-14">
        {/* Мягкое цветовое пятно за иконкой — не ловит тапы */}
        <div
          aria-hidden
          className="pointer-events-none absolute -top-16 left-1/2 z-0 h-56 w-[32rem] max-w-full -translate-x-1/2 rounded-full bg-primary/10 blur-3xl"
        />
        <div className="relative mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/25">
          <Library className="h-8 w-8" />
        </div>
        <h1 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
          Школьная библиотека
        </h1>
        <p className="relative mt-3 max-w-xl text-muted-foreground">
          Учёт школьных учебников без бумажных журналов: что выдано, что на
          руках и кто не вернул — видно в любой момент.
        </p>
        <div className="relative mt-4 flex flex-wrap items-center justify-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Zap className="h-3.5 w-3.5 text-success" />
            Быстро
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3.5 w-3.5 text-success" />
            Просто
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-success" />
            Безопасно
          </span>
        </div>
      </header>

      {/* --- Разделы --- */}
      <section className="mb-12 grid gap-4 sm:grid-cols-3">
        {sections.map((s) => (
          <Link
            key={s.href}
            href={s.href}
            className="group rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            {/* Тень и подъём — на самой карточке (один радиус, один
                переход); active — отклик на тап. */}
            <Card className="flex h-full flex-col transition-[transform,box-shadow] duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md group-active:scale-[0.99] group-active:shadow-none">
              <CardHeader className="flex-1">
                <div
                  className={`mb-3 flex h-11 w-11 items-center justify-center rounded-xl ${s.color}`}
                >
                  <s.icon className="h-5 w-5" />
                </div>
                <CardTitle>{s.title}</CardTitle>
                <CardDescription>
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-primary">
                    {s.role}
                  </span>
                  {s.description}
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                  Открыть
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                </span>
              </CardContent>
            </Card>
          </Link>
        ))}
      </section>

      {/* --- Как это работает --- */}
      <section className="mb-4">
        <h2 className="text-lg font-semibold">Как это работает</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">
          От подготовки до возврата — четыре шага.
        </p>
        <ol className="mt-4 grid gap-3 sm:grid-cols-2">
          {steps.map((step, i) => (
            <li key={step.title}>
              <Card className="h-full">
                <CardContent className="p-4 sm:p-5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-primary">
                      Шаг {i + 1}
                    </span>
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <step.icon className="h-4 w-4" />
                    </span>
                  </div>
                  <p className="mt-2.5 font-semibold leading-snug">
                    {step.title}
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                    {step.text}
                  </p>
                </CardContent>
              </Card>
            </li>
          ))}
        </ol>
      </section>

      <footer className="mt-auto flex flex-col items-center gap-1.5 border-t border-border pt-6 text-center text-xs text-muted-foreground">
        <p className="flex flex-wrap items-center justify-center gap-1.5">
          PWA · Next.js · PostgreSQL · Prisma 8
          <VersionBadge className="flex items-center gap-1 rounded-full border border-border bg-card px-2 py-0.5" />
        </p>
        <p>Сделано для школьной библиотеки</p>
      </footer>
    </main>
  );
}
