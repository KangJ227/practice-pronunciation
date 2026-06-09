import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { appConfig } from "@/lib/config";

export type AppUser = {
  id: string;
  username: string;
};

type AppUserRow = {
  id: string;
  username: string;
};

const rowToAppUser = (row: AppUserRow): AppUser => ({
  id: String(row.id),
  username: String(row.username),
});

export const getAppUserById = async (userId: string): Promise<AppUser | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, username")
    .eq("id", userId)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load user: ${error.message}`);
  }

  return data ? rowToAppUser(data as AppUserRow) : null;
};

const getAppUserByUsername = async (username: string): Promise<AppUser | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, username")
    .eq("username", username.trim().toLowerCase())
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load configured user: ${error.message}`);
  }

  return data ? rowToAppUser(data as AppUserRow) : null;
};

const getMostRecentMaterialUser = async (): Promise<AppUser | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from("materials")
    .select("user_id")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to find latest material owner: ${error.message}`);
  }

  const userId = data?.user_id ? String(data.user_id) : "";
  return userId ? getAppUserById(userId) : null;
};

const getFirstActiveAppUser = async (): Promise<AppUser | null> => {
  const { data, error } = await getSupabaseAdmin()
    .from("app_users")
    .select("id, username")
    .eq("is_active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load fallback user: ${error.message}`);
  }

  return data ? rowToAppUser(data as AppUserRow) : null;
};

export const getDefaultAppUser = async (): Promise<AppUser | null> => {
  if (appConfig.defaultAppUserId) {
    return getAppUserById(appConfig.defaultAppUserId);
  }

  if (appConfig.defaultAppUsername) {
    return getAppUserByUsername(appConfig.defaultAppUsername);
  }

  return (await getMostRecentMaterialUser()) ?? getFirstActiveAppUser();
};
