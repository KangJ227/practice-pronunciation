import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { AppSessionUser } from "@/lib/session";

type VerifiedUserRow = {
  id: string;
  username: string;
};

export const verifyUsernamePassword = async (
  username: string,
  password: string,
): Promise<AppSessionUser | null> => {
  const normalizedUsername = username.trim().toLowerCase();
  if (!normalizedUsername || !password) {
    return null;
  }

  const { data, error } = await getSupabaseAdmin().rpc("verify_app_user_password", {
    p_username: normalizedUsername,
    p_password: password,
  });

  if (error) {
    throw new Error(`Failed to verify login: ${error.message}`);
  }

  const user = (data as VerifiedUserRow[] | null)?.[0];
  return user ? { id: user.id, username: user.username } : null;
};

export const getAppUserById = async (userId: string): Promise<AppSessionUser | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, username")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }

  return data ? { id: String(data.id), username: String(data.username) } : null;
};
