import { getDefaultAppUser, type AppUser } from "@/lib/app-user";

export const getCurrentUser = async (): Promise<AppUser | null> => getDefaultAppUser();

export const requireUser = async () => {
  const user = await getCurrentUser();

  if (!user) {
    throw new Error("No active app user is available.");
  }

  return user;
};

export const requirePageUser = requireUser;
