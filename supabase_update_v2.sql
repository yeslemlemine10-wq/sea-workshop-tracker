-- Run this in the Supabase SQL Editor if upgrading an existing database.
-- If starting fresh, this creates everything needed.

create table if not exists projects (
  id uuid primary key default gen_random_uuid(),
  po text not null,
  name text not null,
  client text,
  supervisor text,
  site_type text default 'workshop',
  site text,
  notes text,
  column_name text not null default 'evaluation',
  stages jsonb default '[]'::jsonb,
  dn_number text,
  dn_date text,
  awarded boolean default true,
  attachments jsonb default '[]'::jsonb,
  blocking_issues jsonb default '[]'::jsonb,
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz default now(),
  updated_by text
);

-- If you already had the old table from before, run these to add the new columns:
alter table projects add column if not exists dn_number text;
alter table projects add column if not exists dn_date text;
alter table projects add column if not exists attachments jsonb default '[]'::jsonb;
alter table projects add column if not exists blocking_issues jsonb default '[]'::jsonb;
alter table projects add column if not exists awarded boolean default true;

-- Rename old "estimation" status values to "evaluation" to match the renamed column
update projects set column_name = 'evaluation' where column_name = 'estimation';

-- New table: daily manpower tracking
create table if not exists manpower (
  id uuid primary key default gen_random_uuid(),
  log_date date not null default current_date,
  location text not null,
  expat_count int default 0,
  local_count int default 0,
  is_workshop boolean default false,
  updated_at timestamptz default now(),
  updated_by text,
  unique(log_date, location)
);

alter table projects enable row level security;
alter table manpower enable row level security;

drop policy if exists "Allow all reads" on projects;
drop policy if exists "Allow all inserts" on projects;
drop policy if exists "Allow all updates" on projects;
drop policy if exists "Allow all deletes" on projects;
create policy "Allow all reads" on projects for select using (true);
create policy "Allow all inserts" on projects for insert with check (true);
create policy "Allow all updates" on projects for update using (true);
create policy "Allow all deletes" on projects for delete using (true);

drop policy if exists "Allow all reads" on manpower;
drop policy if exists "Allow all inserts" on manpower;
drop policy if exists "Allow all updates" on manpower;
drop policy if exists "Allow all deletes" on manpower;
create policy "Allow all reads" on manpower for select using (true);
create policy "Allow all inserts" on manpower for insert with check (true);
create policy "Allow all updates" on manpower for update using (true);
create policy "Allow all deletes" on manpower for delete using (true);

do $$
begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table projects;
  end if;
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'manpower'
  ) then
    alter publication supabase_realtime add table manpower;
  end if;
end $$;
