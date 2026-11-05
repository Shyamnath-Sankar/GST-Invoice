import { cookies } from "next/headers";

export const SESSION_COOKIE = "gst_session";

function sessionHours(): number {
  const configured = Number(process.env.SESSION_HOURS ?? "12");
  return Number.isFinite(configured) && configured > 0 ? configured : 12;
}

export async function setSessionCookie(token: string): Promise<void> {
  const store = await cookies();
  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.COOKIE_SECURE === "true",
    path: "/",
    maxAge: sessionHours() * 60 * 60,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

export async function sessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}
