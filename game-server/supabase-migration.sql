-- Migration Paulogames : compléter le profil Supabase existant pour la carrière F1.
-- À exécuter une seule fois dans Supabase > SQL Editor.
-- Ne supprime ni ne recrée les tables profiles et player_cars.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS name text NOT NULL DEFAULT 'Pilote',
  ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '#e10600',
  ADD COLUMN IF NOT EXISTS num smallint NOT NULL DEFAULT 0 CHECK (num BETWEEN 0 AND 99),
  ADD COLUMN IF NOT EXISTS upgrades jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS logo text NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS owned_logos jsonb NOT NULL DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.player_race_rewards (
  player_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  run_id text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 1 AND 99),
  amount bigint NOT NULL DEFAULT 0 CHECK (amount >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (player_id, run_id)
);

ALTER TABLE public.player_race_rewards ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players can read their own race rewards" ON public.player_race_rewards;
CREATE POLICY "Players can read their own race rewards"
  ON public.player_race_rewards FOR SELECT
  TO authenticated
  USING (auth.uid() = player_id);
