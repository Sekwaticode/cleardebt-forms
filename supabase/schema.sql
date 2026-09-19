-- ==========================================================
-- schema.sql — Run this in the Supabase SQL Editor
-- (Project → SQL Editor → New query → paste → Run)
-- ==========================================================

-- ---------- Extensions ----------
create extension if not exists "pgcrypto"; -- gen_random_uuid()

-- ---------- Table ----------
create table if not exists public.submissions (
  id             uuid primary key default gen_random_uuid(),
  reference      text not null unique,
  form_type      text not null check (form_type in ('client_contract', 'counsellor_transfer', 'power_of_attorney')),
  status         text not null default 'draft' check (status in ('draft', 'submitted', 'approved', 'rejected')),
  client_name    text,
  id_number      text,
  phone          text,
  email          text,
  fields         jsonb not null default '{}'::jsonb,
  signatures     jsonb not null default '{}'::jsonb,   -- { padName: "storagePath.png" }
  pdf_path       text,                                  -- path inside the `pdfs` bucket
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists submissions_status_idx     on public.submissions (status);
create index if not exists submissions_form_type_idx  on public.submissions (form_type);
create index if not exists submissions_created_at_idx on public.submissions (created_at desc);

-- Keep updated_at current on every row change.
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_submissions_updated_at on public.submissions;
create trigger trg_submissions_updated_at
  before update on public.submissions
  for each row execute function public.set_updated_at();

-- ---------- Row Level Security ----------
-- Public forms can be submitted by anyone (no login for clients).
-- Only authenticated (admin) users can read, update or delete —
-- i.e. only people signed in to the dashboard.
alter table public.submissions enable row level security;

drop policy if exists "public can insert submissions" on public.submissions;
create policy "public can insert submissions"
  on public.submissions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "authenticated can select submissions" on public.submissions;
create policy "authenticated can select submissions"
  on public.submissions for select
  to authenticated
  using (true);

drop policy if exists "authenticated can update submissions" on public.submissions;
create policy "authenticated can update submissions"
  on public.submissions for update
  to authenticated
  using (true) with check (true);

drop policy if exists "authenticated can delete submissions" on public.submissions;
create policy "authenticated can delete submissions"
  on public.submissions for delete
  to authenticated
  using (true);

-- NOTE: forms.js currently lets an editor re-open and PATCH a draft it
-- created anonymously (before the client has an account). If you want
-- clients to edit their own drafts before submitting, you'll need a
-- different policy (e.g. a per-draft secret token) — talk to me if you
-- want that; the default above requires an admin session to update.
-- For now, editing existing submissions from the dashboard works
-- because the dashboard requires sign-in.

-- ---------- Storage buckets ----------
-- Both buckets are private; the app always accesses them via
-- short-lived signed URLs (see js/api.js).
insert into storage.buckets (id, name, public)
  values ('signatures', 'signatures', false)
  on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
  values ('pdfs', 'pdfs', false)
  on conflict (id) do nothing;

-- Anyone (including anonymous form-fillers) can upload a signature.
drop policy if exists "anyone can upload signatures" on storage.objects;
create policy "anyone can upload signatures"
  on storage.objects for insert
  to anon, authenticated
  with check (bucket_id = 'signatures');

drop policy if exists "anyone can upsert own signatures" on storage.objects;
create policy "anyone can upsert own signatures"
  on storage.objects for update
  to anon, authenticated
  using (bucket_id = 'signatures')
  with check (bucket_id = 'signatures');

-- Only the dashboard (authenticated) can read signatures back / delete them.
drop policy if exists "authenticated can read signatures" on storage.objects;
create policy "authenticated can read signatures"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'signatures');

drop policy if exists "authenticated can delete signatures" on storage.objects;
create policy "authenticated can delete signatures"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'signatures');

-- PDFs are written by the Edge Function using the service-role key,
-- which bypasses RLS entirely — so we only need a read policy here
-- for the dashboard to generate signed download URLs, and a delete
-- policy so the dashboard can clean up on submission delete.
drop policy if exists "authenticated can read pdfs" on storage.objects;
create policy "authenticated can read pdfs"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'pdfs');

drop policy if exists "authenticated can delete pdfs" on storage.objects;
create policy "authenticated can delete pdfs"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'pdfs');
