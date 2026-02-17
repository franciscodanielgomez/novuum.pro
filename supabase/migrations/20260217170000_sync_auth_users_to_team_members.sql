-- Llevar a team_members a todos los usuarios de Auth que aún no tengan fila.
-- Si te creaste antes del trigger on_auth_user_created, nunca se insertó en team_members.

insert into public.team_members (id, email, full_name, role, active)
select
  u.id,
  u.email,
  coalesce(u.raw_user_meta_data->>'name', split_part(u.email, '@', 1), 'Usuario'),
  'CAJERO',
  true
from auth.users u
where not exists (select 1 from public.team_members tm where tm.id = u.id)
on conflict (id) do nothing;

-- Por si en el futuro alguien no queda insertado por el trigger, permitir que se inserte su propia fila.
drop policy if exists "team members insert own" on public.team_members;
create policy "team members insert own" on public.team_members
for insert to authenticated with check (id = auth.uid());
