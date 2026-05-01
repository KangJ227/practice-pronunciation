import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { appConfig } from "@/lib/config";

export const createClient = async () => {
  if (!appConfig.supabaseUrl || !appConfig.supabasePublishableKey) {
    throw new Error("Supabase public credentials are not configured.");
  }

  const cookieStore = await cookies();

  return createServerClient(appConfig.supabaseUrl, appConfig.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot set cookies. Middleware refreshes sessions.
        }
      },
    },
  });
};
