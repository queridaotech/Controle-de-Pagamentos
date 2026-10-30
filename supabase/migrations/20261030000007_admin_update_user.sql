-- Edição de usuário pelo administrador: nome, e-mail e (opcionalmente) senha.
-- Contas editadas pelo administrador ficam com o e-mail confirmado.
create or replace function public.admin_update_user(
  p_user_id uuid,
  p_full_name text,
  p_email text,
  p_password text default null
) returns void
language plpgsql security definer
set search_path = public, auth, extensions
as $$
declare
  v_email text := lower(trim(p_email));
  v_name text := nullif(trim(coalesce(p_full_name, '')), '');
begin
  if not public.is_admin() then
    raise exception 'Somente administradores podem editar usuários.' using errcode = '42501';
  end if;
  if not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'Usuário não encontrado.';
  end if;
  if v_name is null then
    raise exception 'Informe o nome.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if exists (select 1 from auth.users where lower(email) = v_email and id <> p_user_id) then
    raise exception 'Já existe um usuário com este e-mail.';
  end if;
  if p_password is not null and p_password <> '' and length(p_password) < 8 then
    raise exception 'A senha deve ter pelo menos 8 caracteres.';
  end if;

  update auth.users
     set email = v_email,
         email_confirmed_at = coalesce(email_confirmed_at, now()),
         raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', v_name),
         encrypted_password = case when p_password is not null and p_password <> ''
                                   then extensions.crypt(p_password, extensions.gen_salt('bf'))
                                   else encrypted_password end,
         updated_at = now()
   where id = p_user_id;

  update auth.identities
     set identity_data = identity_data || jsonb_build_object('email', v_email, 'full_name', v_name, 'email_verified', true),
         updated_at = now()
   where user_id = p_user_id and provider = 'email';

  update public.profiles set full_name = v_name, email = v_email where id = p_user_id;
end $$;

revoke execute on function public.admin_update_user(uuid, text, text, text) from public, anon;
grant execute on function public.admin_update_user(uuid, text, text, text) to authenticated;
