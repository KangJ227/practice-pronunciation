import { redirect } from "next/navigation";
import { appConfig } from "@/lib/config";
import { getCurrentUser } from "@/lib/auth";
import { LoginForm } from "@/app/login/login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ denied?: string; next?: string }>;
}) {
  const params = await searchParams;
  const user = await getCurrentUser();

  if (user) {
    redirect(params.next || "/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-paper px-5 py-10">
      <section className="w-full max-w-md rounded-[28px] border border-black/10 bg-white/85 p-6 shadow-card backdrop-blur md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass">
          Private Access
        </p>
        <h1 className="mt-3 font-display text-4xl text-ink">Atelier de Prononciation</h1>
        <p className="mt-3 text-sm leading-6 text-ink/70">
          Sign in with the allowed email to open your pronunciation workspace.
        </p>
        <div className="mt-6">
          <LoginForm
            allowedEmail={appConfig.allowedLoginEmail}
            denied={params.denied === "1"}
            next={params.next || "/"}
          />
        </div>
      </section>
    </main>
  );
}
