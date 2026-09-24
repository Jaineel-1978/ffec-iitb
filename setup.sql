-- Run once in Supabase Dashboard → SQL Editor after creating the project.
create table if not exists public.tournament_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);

create table if not exists public.teams (
  group_code text not null check (group_code in ('A','B')),
  team_number smallint not null check (team_number between 1 and 12),
  team_name text not null,
  primary key (group_code, team_number)
);

create table if not exists public.match_results (
  group_code text not null,
  match_number smallint not null check (match_number between 1 and 5),
  team_number smallint not null check (team_number between 1 and 12),
  placement smallint not null check (placement between 1 and 12),
  kills integer not null check (kills >= 0),
  primary key (group_code, match_number, team_number),
  unique (group_code, match_number, placement),
  foreign key (group_code, team_number) references public.teams(group_code, team_number) on delete cascade
);

alter table public.tournament_admins enable row level security;
alter table public.teams enable row level security;
alter table public.match_results enable row level security;

grant usage on schema public to anon, authenticated;
grant select on public.teams, public.match_results to anon, authenticated;
grant insert, update, delete on public.teams, public.match_results to authenticated;

-- This function checks the allowlist without exposing admin membership to visitors.
create or replace function public.is_tournament_admin()
returns boolean language sql stable security definer set search_path = ''
as $$ select exists (select 1 from public.tournament_admins a where a.user_id = auth.uid()); $$;

drop policy if exists "Anyone can view teams" on public.teams;
create policy "Anyone can view teams" on public.teams for select using (true);
drop policy if exists "Admins manage teams" on public.teams;
create policy "Admins manage teams" on public.teams for all to authenticated using (public.is_tournament_admin()) with check (public.is_tournament_admin());

drop policy if exists "Anyone can view results" on public.match_results;
create policy "Anyone can view results" on public.match_results for select using (true);
drop policy if exists "Admins manage results" on public.match_results;
create policy "Admins manage results" on public.match_results for all to authenticated using (public.is_tournament_admin()) with check (public.is_tournament_admin());

-- Seed placeholder names; organizers can rename these in the sign-in panel.
insert into public.teams(group_code, team_number, team_name)
select g, n, 'Team ' || lpad((n + case when g='A' then 0 else 12 end)::text, 2, '0')
from (values ('A'),('B')) as groups(g) cross join generate_series(1,12) as nums(n)
on conflict (group_code, team_number) do nothing;

-- After creating your organizer user in Authentication → Users, replace the email below
-- with your own and run this statement in SQL Editor. Never add this permission in browser code.
-- insert into public.tournament_admins(user_id)
-- select id from auth.users where email = 'YOUR-LOGIN-EMAIL';
