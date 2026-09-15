import Link from "next/link";
import { KeyRound } from "lucide-react";

// Недействительная или уже использованная magic link (M23).
export default function InvalidInvitePage() {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md rounded-xl border border-border bg-card p-8 text-center">
        <KeyRound className="mx-auto mb-4 h-10 w-10 text-muted-foreground" />
        <h1 className="mb-2 text-lg font-semibold">Ссылка не подошла</h1>
        <p className="mb-6 text-sm text-muted-foreground">
          Эта ссылка недействительна или уже была использована. Одноразовую
          ссылку можно открыть только один раз — попросите у учителя новую.
        </p>
        <Link
          href="/student"
          className="inline-flex items-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          К входу в кабинет
        </Link>
      </div>
    </main>
  );
}
