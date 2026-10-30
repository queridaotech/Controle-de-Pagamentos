-- =============================================================================
-- Migration 05: endurecimento de segurança (recomendações do Supabase Advisor)
-- =============================================================================

-- search_path fixo em todas as funções
alter function public.set_updated_at() set search_path = public;
alter function public.brazil_today() set search_path = public;
alter function public.validate_payment_condition() set search_path = public;
alter function public.create_project(uuid, text, date, numeric, date, uuid, text, jsonb) set search_path = public;
alter function public.replace_pending_installments(uuid, numeric, jsonb) set search_path = public;
alter function public.register_payment(uuid, numeric, date, text) set search_path = public;
alter function public.load_demo_data() set search_path = public;
alter function public.remove_demo_data() set search_path = public;

-- funções de gatilho: ninguém precisa chamá-las via API
revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.log_audit() from public, anon, authenticated;

-- helpers de RLS: somente usuários autenticados (as policies precisam deles)
revoke execute on function public.is_active_user() from public, anon;
revoke execute on function public.is_admin() from public, anon;
grant execute on function public.is_active_user(), public.is_admin() to authenticated;

-- RPCs de negócio: nada para anônimo
revoke execute on function public.create_project(uuid, text, date, numeric, date, uuid, text, jsonb) from public, anon;
revoke execute on function public.replace_pending_installments(uuid, numeric, jsonb) from public, anon;
revoke execute on function public.register_payment(uuid, numeric, date, text) from public, anon;
revoke execute on function public.load_demo_data() from public, anon;
revoke execute on function public.remove_demo_data() from public, anon;
revoke execute on function public.brazil_today() from public, anon;
grant execute on function public.brazil_today() to authenticated;
