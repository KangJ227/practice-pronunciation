import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { appConfig } from "@/lib/config";
import { createClient } from "@/lib/supabase/server";

export const isAllowedUser = (user: Pick<User, "email"> | null) => {
  if (!user?.email || !appConfig.allowedLoginEmail) {
    return false;
  }

  return user.email.toLowerCase() === appConfig.allowedLoginEmail;
};

export const getCurrentUser = async () => {
  if (!appConfig.supabaseUrl || !appConfig.supabasePublishableKey) {
    return null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();

  if (error || !data.user || !isAllowedUser(data.user)) {
    return null;
  }

  return data.user;
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
