import { redirect } from "next/navigation";

/**
 * Магическая ссылка ученика: /invite/<одноразовый-токен>.
 *
 * Тонкий форвардер в route handler /api/invite/<токен>: там проверяется
 * токен, он атомарно расходуется, ставится httpOnly-cookie сессии
 * (30 дней) и идёт редирект в личный кабинет. В server-компоненте
 * cookie ставить нельзя — поэтому логика в route handler.
 *
 * Браузеру прозрачно: два 302 подряд, ученик видит только «один клик —
 * и я в кабинете».
 */
export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  redirect(`/api/invite/${token}`);
}
