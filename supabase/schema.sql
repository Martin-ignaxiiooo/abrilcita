-- ============================================================
-- Abrilcita - Control de Salud Gatuno
-- Script SQL para Supabase
-- ============================================================
-- COMO USARLO:
-- 1. Ve a tu proyecto en https://supabase.com
-- 2. Abre "SQL Editor" (panel izquierdo)
-- 3. Pega TODO este script y ejecútalo (Run)
-- ============================================================

-- ============================================================
-- A) HABILITAR ROW LEVEL SECURITY
--    Por defecto todo está bloqueado hasta que definamos policies.
--    (Opcional pero recomendado: si no usas auth, quita estas en el punto E)
-- ============================================================

-- ============================================================
-- B) TABLA: profile  (una fila por gatita)
-- ============================================================
create table if not exists public.profile (
  id uuid primary key default gen_random_uuid(),
  name text,
  birth date,
  breed text,
  weight numeric,
  sex text,
  color text,
  vet text,
  vet_phone text,
  rut text,
  photo text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ============================================================
-- C) TABLAS DE COLECCIONES (arreglos de registros)
-- ============================================================

-- VACUNAS
create table if not exists public.vaccines (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  date date not null,
  lot text,
  lab text,
  vet text,
  next date,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);

-- DESPARASITACIÓN
create table if not exists public.deworming (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  date date not null,
  product text,
  dose text,
  weight numeric,
  next date,
  vet text,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);

-- CONTROLES VETERINARIOS
create table if not exists public.controls (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  type text not null,
  vet text,
  vet_name text,
  reason text,
  weight numeric,
  result text,
  cost numeric,
  notes text,
  created_at timestamptz default now()
);

-- NOTAS
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  title text not null,
  description text,
  created_at timestamptz default now()
);

-- ALIMENTACIÓN (una fila por gatita, igual que profile)
create table if not exists public.food (
  id uuid primary key default gen_random_uuid(),
  type text,
  brand text,
  amount text,
  cost numeric,
  notes text,
  supplements text,
  treats text,
  restrictions text,
  time1 time,
  time2 time,
  time3 time,
  times text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- CAMBIOS DE ALIMENTACIÓN
create table if not exists public.food_changes (
  id uuid primary key default gen_random_uuid(),
  date date not null,
  description text not null,
  reason text,
  created_at timestamptz default now()
);

-- CONTROL DE PESO
create table if not exists public.weights (
  id uuid primary key default gen_random_uuid(),
  d date not null,
  w numeric not null,
  created_at timestamptz default now()
);

-- ============================================================
-- D) ÍNDICES (para consultas más rápidas por fecha)
-- ============================================================
create index if not exists idx_vaccines_date on public.vaccines(date);
create index if not exists idx_deworming_date on public.deworming(date);
create index if not exists idx_controls_date on public.controls(date);
create index if not exists idx_notes_date on public.notes(date);
create index if not exists idx_food_changes_date on public.food_changes(date);
create index if not exists idx_weights_date on public.weights(d);

-- ============================================================
-- E) ROW LEVEL SECURITY (RLS)
--    IMPORTANTE: La app actual NO usa login de usuarios.
--    Si NO vas a usar auth ni login, ejecuta esto para permitir
--    acceso de lectura/escritura público (abierto, sin login):
-- ============================================================

alter table public.profile enable row level security;
alter table public.vaccines enable row level security;
alter table public.deworming enable row level security;
alter table public.controls enable row level security;
alter table public.notes enable row level security;
alter table public.food enable row level security;
alter table public.food_changes enable row level security;
alter table public.weights enable row level security;

-- Policy: permitir todo para anon (sin login)
-- ⚠️ Usa esto SOLO para uso personal (una sola gatita, sin datos sensibles)
create policy "Allow full access profile" on public.profile for all using (true) with check (true);
create policy "Allow full access vaccines" on public.vaccines for all using (true) with check (true);
create policy "Allow full access deworming" on public.deworming for all using (true) with check (true);
create policy "Allow full access controls" on public.controls for all using (true) with check (true);
create policy "Allow full access notes" on public.notes for all using (true) with check (true);
create policy "Allow full access food" on public.food for all using (true) with check (true);
create policy "Allow full access food_changes" on public.food_changes for all using (true) with check (true);
create policy "Allow full access weights" on public.weights for all using (true) with check (true);

-- ============================================================
-- F) NOTA SOBRE AUTH (OPCIONAL, a futuro)
--    Si en el futuro quieres login por usuario, reemplaza el
--    punto E por políticas basadas en auth.uid() y agrega una
--    columna user_id a cada tabla. No lo necesitas ahora.
-- ============================================================
