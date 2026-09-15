import Link from "next/link";
import { ArrowRight, CircleCheck, KeyRound } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Eyebrow, Panel } from "@/components/ui/panel";
import { PrintButton } from "@/components/print-button";

export const metadata = {
  title: "Вход в систему — инструкция",
  description:
    "Как войти в кабинет библиотекаря и администратора, что проверить, если пароль не подходит, и кто назначает новый.",
};

/**
 * Страница помощи для входа. Открыта без авторизации — именно она
 * подсказывают человеку, который НЕ может войти; закрывать её сессией
 * бессмысленно. Никаких секретов на странице нет: только порядок действий.
 *
 * Ссылки на неё — с экрана входа («Забыли пароль?» / «Инструкция по входу»).
 */

const checks = [
  {
    t: "Русская раскладка",
    d: "Логин и пароль — латиницей. Переключите язык клавиатуры и введите заново: символы «b» и «и» выглядят одинаково, а система их различает.",
  },
  {
    t: "Caps Lock",
    d: "Регистр важен. На экране входа есть подсказка «Caps Lock включён» — она появляется, как только вы начали печатать при включённом верхнем регистре.",
  },
  {
    t: "Опечатка в пароле",
    d: "Нажмите значок глаза в поле пароля: ввод станет видимым, стирать ничего не нужно.",
  },
  {
    t: "Автозамена и переносы",
    d: "Если пароль вставлен из блокнота или мессенджера, к нему могли приклеиться пробел или перенос строки. Лучше ввести вручную.",
  },
  {
    t: "Разрешены ли cookie",
    d: "При заблокированных cookie вход «проходит» и сразу возвращает на эту страницу. В Chrome: настройки сайта → Файлы cookie → разрешить.",
  },
  {
    t: "Сервер вообще отвечает",
    d: "Ошибка «Сервер не отвечает» — это не пароль: проверьте, открыт ли адрес библиотеки, и повторите позже.",
  },
];

const steps = [
  {
    t: "Откройте адрес библиотеки",
    d: "Закладка «Библиотека — вход» или адрес, который дал администратор. На телефоне удобнее установить приложение: меню браузера → «Установить приложение».",
  },
  {
    t: "Введите логин",
    d: "Выдать его должен администратор школы. Обычно это короткое имя отдела или фамилия — строчными латинскими буквами, без пробелов.",
  },
  {
    t: "Введите пароль",
    d: "Тоже строчными. Проверяйте значком глаза, если не уверены, что набрали верно.",
  },
  {
    t: "Нажмите «Войти»",
    d: "Откроется вкладка «Выдача». Разделы переключаются лентой сверху: «Долги», «Журнал», «Каталог», «Классы».",
  },
];

export default function LoginHelpPage() {
  return (
    <main className="min-h-dvh">
      <PageHeader
        icon={KeyRound}
        title="Вход в систему"
        subtitle="Инструкция для библиотекаря и администратора"
        backHref="/login"
        backLabel="Ко входу"
      />

      <div className="safe-x mx-auto max-w-2xl space-y-5 px-4 py-5 sm:py-6">
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Страница открыта без входа — её можно дать учителю, распечатать или
          добавить в закладки: паролей здесь нет, только порядок действий.
        </p>

        {/* ------------------------------ Как войти ------------------------------ */}
        <section id="instrukciya" className="scroll-mt-24">
          <Eyebrow className="text-primary">Инструкция по входу</Eyebrow>
          <h2 className="mt-1 text-xl sm:text-[1.5rem]">Четыре шага</h2>
          <ol className="mt-3 space-y-2">
            {steps.map((s, i) => (
              <li key={s.t}>
                <div className="flex gap-3.5 rounded-lg border border-border bg-card p-4">
                  <span className="num text-xl font-semibold leading-none text-primary/55">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <div className="min-w-0">
                    <p className="font-semibold leading-snug">{s.t}</p>
                    <p className="mt-1 text-[15px] leading-relaxed text-muted-foreground">
                      {s.d}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {/* --------------------------- Пароль не подходит --------------------------- */}
        <section id="zabyli-parol" className="scroll-mt-24">
          <Eyebrow className="text-primary">Забыли пароль?</Eyebrow>
          <h2 className="mt-1 text-xl sm:text-[1.5rem]">
            Сначала проверьте шесть мелочей
          </h2>
          <Card>
            <CardContent className="p-0">
              <ul className="cv-rows divide-y divide-border">
                {checks.map((c) => (
                  <li key={c.t} className="flex gap-3 px-4 py-3.5">
                    <CircleCheck
                      className="mt-0.5 h-5 w-5 shrink-0 text-success"
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <p className="font-semibold leading-snug">{c.t}</p>
                      <p className="mt-0.5 text-[15px] leading-relaxed text-muted-foreground">
                        {c.d}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>

          {/* Честно про сброс: самообслуживания в приложении нет, и это
              осознанно — пароль хранится хешем и «забыть» его нельзя. */}
          <Panel
            className="mt-4"
            eyebrow="Если не помогло"
            title="Пароль назначает заново администратор школы"
            subtitle="В приложении нет самообслуживаемого сброса по e-mail: пароль сотрудника хранится только как хеш, поэтому его не показывают и не «восстанавливают» — можно назначить новый."
            bodyClassName="mt-4 space-y-2 text-[15px] leading-relaxed"
          >
            <p className="panel-muted">
              1. Сообщите администратору школы логин, для которого нужен доступ.
            </p>
            <p className="panel-muted">
              2. Администратор назначает новый пароль и передаёт его лично —
              по телефону или на бумаге, не в общий чат.
            </p>
            <p className="panel-muted">
              3. Новый пароль сохраните сразу — в менеджере паролей браузера
              или на бумаге в шкафу: общий пароль быстро забывается, а
              спрашивать его по кругу дороже, чем один раз записать.
            </p>
          </Panel>
        </section>

        {/* ------------------------------ Ученику ------------------------------ */}
        <Card>
          <CardHeader>
            <CardTitle>Вы ученик или родитель?</CardTitle>
            <CardDescription>
              Этот вход — для персонала библиотеки.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[15px] leading-relaxed text-muted-foreground">
              Ученик входит в{" "}
              <Link
                href="/student"
                className="font-semibold text-primary underline underline-offset-4"
              >
                личный кабинет
              </Link>
              : по QR-карточке, по логину и паролю или по одноразовой ссылке от
              учителя. Свои логин и пароль видно в кабинете («Ваши данные для
              входа») — сохраните их или распечатайте.
            </p>
            <Link
              href="/student"
              className="inline-flex min-h-11 items-center gap-1.5 text-[15px] font-semibold text-primary underline decoration-primary/30 underline-offset-4"
            >
              Перейти во вход ученика
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </CardContent>
        </Card>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border pt-5">
          <p className="text-sm text-muted-foreground">
            Не хватает пункта? Попросите администратора добавить его сюда —
            страница одна и печатается на одном листе.
          </p>
          <PrintButton />
        </div>
      </div>
    </main>
  );
}
