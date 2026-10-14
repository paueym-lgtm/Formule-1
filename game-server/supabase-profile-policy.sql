-- Autoriser chaque joueur à modifier uniquement son propre nom/couleur/numéro.
-- Exécuter après supabase-migration.sql.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players can update their own driver profile" ON public.profiles;
CREATE POLICY "Players can update their own driver profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
REVOKE UPDATE ON public.profiles FROM authenticated;
GRANT UPDATE (name, color, num) ON public.profiles TO authenticated;
