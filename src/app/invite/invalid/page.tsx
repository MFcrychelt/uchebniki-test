import Link from "next/link";
import { KeyRound } from "lucide-react";

/**
 * Недействительная или уже использованная magic link (M23).
 * Отдельный экран, потому что ученик приходит на него из мессенджера:
 * ему нужно объяснить причину и дать один явный путь дальше.
 */
export default function InvalidInvitePage() {
  return (
    <main className="safe-x safe-b mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-8">
      <section className="panel p-6 text-center sm:p-8">
        <span className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-white/15">
          <KeyRound className="h-6 w-6" aria-hidden />
        </span>
        <p className="eyebrow text-panel-muted">Одноразовая ссылка</p>
        <h1 className="mt-1 text-2xl font-extrabold leading-tight">
          Ссылка не подошла
        </h1>
        <p className="panel-muted mx-auto mt-3 max-w-sm text-sm leading-relaxed">
          Она недействительна или уже открыта — такую можно использовать
          только один раз. Попросите у учителя новую ссылку или войдите
          по логину и паролю.
        </p>
        <Link
          href="/student"
          className="mt-6 inline-flex h-12 w-full items-center justify-center rounded-full bg-panel-foreground px-6 text-sm font-bold tracking-[0.08em] text-panel transition-transform duration-100 active:scale-[0.985]"
        >
          К ВХОДУ В КАБИНЕТ
        </Link>
      </section>
    </main>
  );
}
