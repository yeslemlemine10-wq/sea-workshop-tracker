-- Run this once in the Supabase SQL Editor (Supabase dashboard > SQL Editor > New query > paste > Run)

create table projects (
  id uuid primary key default gen_random_uuid(),
  po text not null,
  name text not null,
  client text,
  supervisor text,
  site_type text default 'workshop',
  site text,
  notes text,
  column_name text not null default 'estimation',
  stages jsonb default '[]'::jsonb,
  delivery_po_date text,
  history jsonb default '[]'::jsonb,
  created_at timestamptz default now(),
  approved_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz default now(),
  updated_by text
);

-- Allow anyone with the anon key (i.e. the web app) to read and write.
-- This is intentionally open since the team accesses it via a shared link, not individual logins.
alter table projects enable row level security;

create policy "Allow all reads" on projects
  for select using (true);

create policy "Allow all inserts" on projects
  for insert with check (true);

create policy "Allow all updates" on projects
  for update using (true);

create policy "Allow all deletes" on projects
  for delete using (true);

-- Enable realtime so updates push to every open browser instantly
alter publication supabase_realtime add table projects;

-- Optional: seed with a couple of example rows so the board isn't empty on first load
insert into projects (po, name, client, supervisor, site_type, site, notes, column_name, stages, updated_by)
values
('PO-2026-114', 'Aftout Essahili', 'RAZEL-BEC', 'Imed TLAHIG', 'external', 'Beni Nadji',
 'Exterior coating SEALID-Tape, PREMTAP Tropical as alternative', 'ongoing',
 '[{"name":"Engineering","status":"done"},{"name":"Procurement","status":"done"},{"name":"Civil Work","status":"active"},{"name":"Mobilization","status":"pending"},{"name":"Erecting","status":"pending"},{"name":"Delivery","status":"pending"}]',
 'Imed TLAHIG'),
('PO-2026-101', 'Sports complex BOQ', 'Fonds Tasiast', 'Mr. Khaled', 'workshop', '',
 'Structural cost benchmarking vs Bababe stadium', 'estimation', '[]', 'Mr. Khaled');
