create table if not exists public.shared_plans (
  room_id text not null,
  timeline_id text not null,
  team jsonb not null default '[]'::jsonb,
  usages jsonb not null default '[]'::jsonb,
  expanded_jobs jsonb not null default '[]'::jsonb,
  timeline jsonb,
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (room_id, timeline_id)
);

create index if not exists shared_plans_updated_at_idx
  on public.shared_plans (updated_at desc);

create or replace function public.set_shared_plans_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists set_shared_plans_updated_at on public.shared_plans;

create trigger set_shared_plans_updated_at
before update on public.shared_plans
for each row
execute function public.set_shared_plans_updated_at();

alter table public.shared_plans enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_plans'
      and policyname = 'shared_plans_public_read'
  ) then
    create policy shared_plans_public_read
      on public.shared_plans
      for select
      using (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_plans'
      and policyname = 'shared_plans_public_insert'
  ) then
    create policy shared_plans_public_insert
      on public.shared_plans
      for insert
      with check (true);
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'shared_plans'
      and policyname = 'shared_plans_public_update'
  ) then
    create policy shared_plans_public_update
      on public.shared_plans
      for update
      using (true)
      with check (true);
  end if;
end
$$;
