-- ============================================================
-- Abrilcita - Migración: tabla MEDICACIÓN ACTIVA
-- Ejecútalo SOLO si ya corriste schema.sql (antes de que
-- existiera la tabla medications). Es idempotente.
-- Pega esto en: Supabase -> SQL Editor -> Run
-- ============================================================

create table if not exists public.medications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  dose text,
  inst text,
  created_at timestamptz default now()
);

create index if not exists idx_medications_created on public.medications(created_at);

alter table public.medications enable row level security;
create policy "Allow full access medications" on public.medications
  for all using (true) with check (true);
