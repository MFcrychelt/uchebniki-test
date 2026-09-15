import Link from "next/link";
import { WifiOff } from "lucide-react";

export const metadata = { title: "Нет подключения" };

export default function OfflinePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center">
      <WifiOff className="h-12 w-12 text-muted-foreground" />
      <h1 className="text-2xl font-bold">Нет подключения к интернету</h1>
      <p className="max-w-sm text-muted-foreground">
        Страница могла быть загружена с кэша, либо приложение сейчас
        недоступно. Проверьте соединение и попробуйте снова.
      </p>
      <Link
        href="/"
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        На главную
      </Link>
    </main>
  );
}
