import { createClient } from "@supabase/supabase-js";
import { appConfig } from "@/lib/config";

export const getSupabaseAdmin = () => {
  if (!appConfig.supabaseUrl || !appConfig.supabaseServiceRoleKey) {
    throw new Error("Supabase server credentials are not configured.");
  }

  return createClient(appConfig.supabaseUrl, appConfig.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
};
