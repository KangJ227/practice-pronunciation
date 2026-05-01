alter table public.app_users enable row level security;

revoke all on table public.app_users from anon, authenticated;

revoke execute on function public.verify_app_user_password(text, text)
  from public, anon, authenticated;

grant execute on function public.verify_app_user_password(text, text)
  to service_role;
