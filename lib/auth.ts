import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { getAppUserById } from "@/lib/password-auth";
import {
  sessionCookieName,
  verifySessionToken,
  type AppSessionUser,
} from "@/lib/session";

export const getCurrentUser = async (): Promise<AppSessionUser | null> => {
  const cookieStore = await cookies();
  const sessionUser = await verifySessionToken(cookieStore.get(sessionCookieName)?.value);
  if (!sessionUser) {
    return null;
  }

  return getAppUserById(sessionUser.id);
};

export const requireUser = async () => {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("Authentication required.");
  }

  return user;
};

export const requirePageUser = async () => {
  const user = await getCurrentUser();

  if (!user) {
    redirect("/login");
  }

  return user;
};
