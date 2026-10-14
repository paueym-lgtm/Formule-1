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
  ON public.player_race_rewards FOR SELECT TO authenticated USING (auth.uid() = player_id);

-- Toutes les modifications d'argent et de boutique passent par ces fonctions SQL,
-- jamais par une mise à jour libre des crédits depuis le navigateur.
CREATE OR REPLACE FUNCTION public.career_profile_json(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',id,'username',username,'name',name,'color',color,'num',num,
    'cash',credits,'upgrades',upgrades,'logo',logo,'ownedLogos',owned_logos,
    'createdAt',created_at,'isAdmin',false
  ) FROM public.profiles WHERE id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.career_update_profile(p_name text,p_color text,p_num integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour continuer.'; END IF;
  UPDATE public.profiles
    SET name=left(coalesce(nullif(trim(p_name),''),'Pilote'),14),
        color=CASE WHEN p_color ~ '^#[0-9A-Fa-f]{6}$' THEN p_color ELSE '#e10600' END,
        num=greatest(0,least(99,coalesce(p_num,0)))
    WHERE id=uid;
  RETURN jsonb_build_object('user',public.career_profile_json(uid),'message','Profil sauvegardé dans Supabase.');
END;
$$;

CREATE OR REPLACE FUNCTION public.career_purchase_item(p_item_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid(); item_price bigint; item_type text; item_key text; item_level integer;
  item_logo text; required_level integer := 0; row_profile public.profiles%ROWTYPE;
  owned jsonb; ups jsonb; selected_logo text; response_message text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour continuer.'; END IF;
  CASE p_item_id
    WHEN 'pit1' THEN item_price:=250000; item_type:='upgrade'; item_key:='pit'; item_level:=1;
    WHEN 'pit2' THEN item_price:=750000; item_type:='upgrade'; item_key:='pit'; item_level:=2; required_level:=1;
    WHEN 'tires1' THEN item_price:=150000; item_type:='upgrade'; item_key:='tires'; item_level:=1;
    WHEN 'tires2' THEN item_price:=450000; item_type:='upgrade'; item_key:='tires'; item_level:=2; required_level:=1;
    WHEN 'brakes1' THEN item_price:=200000; item_type:='upgrade'; item_key:='brakes'; item_level:=1;
    WHEN 'brakes2' THEN item_price:=500000; item_type:='upgrade'; item_key:='brakes'; item_level:=2; required_level:=1;
    WHEN 'handling1' THEN item_price:=200000; item_type:='upgrade'; item_key:='handling'; item_level:=1;
    WHEN 'handling2' THEN item_price:=450000; item_type:='upgrade'; item_key:='handling'; item_level:=2; required_level:=1;
    WHEN 'engine1' THEN item_price:=300000; item_type:='upgrade'; item_key:='engine'; item_level:=1;
    WHEN 'engine2' THEN item_price:=800000; item_type:='upgrade'; item_key:='engine'; item_level:=2; required_level:=1;
    WHEN 'aero1' THEN item_price:=550000; item_type:='upgrade'; item_key:='aero'; item_level:=1;
    WHEN 'logo_pg' THEN item_price:=50000; item_type:='logo'; item_logo:='pg';
    WHEN 'logo_bolt' THEN item_price:=80000; item_type:='logo'; item_logo:='bolt';
    WHEN 'logo_crown' THEN item_price:=125000; item_type:='logo'; item_logo:='crown';
    WHEN 'logo_apex' THEN item_price:=175000; item_type:='logo'; item_logo:='apex';
    ELSE RAISE EXCEPTION 'Article inconnu.';
  END CASE;
  SELECT * INTO row_profile FROM public.profiles WHERE id=uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Profil Supabase introuvable.'; END IF;
  ups:=coalesce(row_profile.upgrades,'{}'::jsonb); owned:=coalesce(row_profile.owned_logos,'[]'::jsonb);
  selected_logo:=coalesce(row_profile.logo,'none');
  IF item_type='upgrade' THEN
    IF coalesce((ups->>item_key)::integer,0)>=item_level THEN RAISE EXCEPTION 'Cette amélioration est déjà achetée.'; END IF;
    IF required_level>0 AND coalesce((ups->>item_key)::integer,0)<required_level THEN RAISE EXCEPTION 'Prérequis manquant : achète d’abord le niveau précédent.'; END IF;
  ELSIF owned @> jsonb_build_array(item_logo) THEN
    UPDATE public.profiles SET logo=item_logo WHERE id=uid;
    RETURN jsonb_build_object('user',public.career_profile_json(uid),'message','Logo équipé gratuitement.');
  END IF;
  IF row_profile.credits<item_price THEN RAISE EXCEPTION 'Fonds insuffisants.'; END IF;
  IF item_type='upgrade' THEN ups:=jsonb_set(ups,ARRAY[item_key],to_jsonb(item_level),true);
  ELSE owned:=owned||jsonb_build_array(item_logo);selected_logo:=item_logo; END IF;
  UPDATE public.profiles SET credits=credits-item_price,upgrades=ups,logo=selected_logo,owned_logos=owned WHERE id=uid;
  RETURN jsonb_build_object('user',public.career_profile_json(uid),'message','Achat confirmé et sauvegardé dans Supabase.');
END;
$$;

CREATE OR REPLACE FUNCTION public.career_equip_logo(p_logo text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour continuer.'; END IF;
  IF p_logo NOT IN ('pg','bolt','crown','apex') THEN RAISE EXCEPTION 'Logo inconnu.'; END IF;
  UPDATE public.profiles SET logo=p_logo WHERE id=uid AND owned_logos @> jsonb_build_array(p_logo);
  IF NOT FOUND THEN RAISE EXCEPTION 'Tu ne possèdes pas ce logo.'; END IF;
  RETURN jsonb_build_object('user',public.career_profile_json(uid),'message','Logo équipé et sauvegardé dans Supabase.');
END;
$$;

CREATE OR REPLACE FUNCTION public.career_award_reward(p_run_id text,p_position integer,p_disqualified boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE uid uuid := auth.uid(); prize bigint; inserted_amount bigint; new_profile jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour continuer.'; END IF;
  IF coalesce(trim(p_run_id),'')='' OR length(p_run_id)>120 THEN RAISE EXCEPTION 'Identifiant de course invalide.'; END IF;
  IF p_position<1 OR p_position>99 THEN RAISE EXCEPTION 'Position de course invalide.'; END IF;
  prize:=CASE WHEN coalesce(p_disqualified,false) THEN 0 WHEN p_position=1 THEN 1000 WHEN p_position=2 THEN 500 WHEN p_position=3 THEN 100 ELSE 0 END;
  INSERT INTO public.player_race_rewards(player_id,run_id,position,amount)
    VALUES(uid,p_run_id,p_position,prize) ON CONFLICT(player_id,run_id) DO NOTHING RETURNING amount INTO inserted_amount;
  IF FOUND THEN
    IF inserted_amount>0 THEN UPDATE public.profiles SET credits=credits+inserted_amount WHERE id=uid; END IF;
    new_profile:=public.career_profile_json(uid);
    RETURN jsonb_build_object('user',new_profile,'reward',inserted_amount,'message',CASE WHEN inserted_amount>0 THEN 'Récompense créditée et sauvegardée.' ELSE 'Course enregistrée sans récompense financière.' END);
  END IF;
  RETURN jsonb_build_object('user',public.career_profile_json(uid),'reward',0,'message','Cette course a déjà été enregistrée pour ce compte.');
END;
$$;

REVOKE ALL ON FUNCTION public.career_profile_json(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.career_profile_json(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_update_profile(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_purchase_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_equip_logo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_award_reward(text,integer,boolean) TO authenticated;


-- Autoriser chaque joueur à modifier uniquement son propre nom/couleur/numéro.
-- Exécuter après supabase-migration.sql.
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Players can update their own driver profile" ON public.profiles;
CREATE POLICY "Players can update their own driver profile"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);
REVOKE UPDATE ON public.profiles FROM authenticated;
REVOKE UPDATE (username, credits, upgrades, logo, owned_logos, id, created_at) ON public.profiles FROM authenticated;
GRANT UPDATE (name, color, num) ON public.profiles TO authenticated;




-- Admin sécurisé pour le propriétaire du pseudo paueym.
-- Le pseudo est unique dans profiles ; les droits de modification de profil
-- accordés aux joueurs excluent la colonne username.
CREATE OR REPLACE FUNCTION public.career_profile_json(p_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'id',id,'username',username,'name',name,'color',color,'num',num,
    'cash',credits,'upgrades',upgrades,'logo',logo,'ownedLogos',owned_logos,
    'createdAt',created_at,'isAdmin',(lower(username)='paueym')
  ) FROM public.profiles WHERE id=p_id;
$$;

CREATE OR REPLACE FUNCTION public.career_is_admin()
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND lower(username) = 'paueym'
  );
$$;

CREATE OR REPLACE FUNCTION public.career_admin_list_accounts()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE result jsonb;
BEGIN
  IF NOT public.career_is_admin() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Accès administrateur refusé.';
  END IF;
  SELECT COALESCE(
    jsonb_agg(jsonb_build_object(
      'username',username,'name',name,'color',color,'num',num,
      'cash',credits,'upgrades',upgrades,'logo',logo,
      'ownedLogos',owned_logos,'createdAt',created_at
    ) ORDER BY created_at DESC),
    '[]'::jsonb
  ) INTO result FROM public.profiles;
  RETURN jsonb_build_object('accounts',result);
END;
$$;

CREATE OR REPLACE FUNCTION public.career_admin_set_cash(p_username text, p_cash bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $$
DECLARE target_id uuid;
BEGIN
  IF NOT public.career_is_admin() THEN
    RAISE EXCEPTION USING ERRCODE='42501', MESSAGE='Accès administrateur refusé.';
  END IF;
  IF p_cash IS NULL OR p_cash < 0 OR p_cash > 9000000000000000 THEN
    RAISE EXCEPTION USING ERRCODE='22023', MESSAGE='Le solde doit être un nombre entier positif valide.';
  END IF;
  SELECT id INTO target_id FROM public.profiles
    WHERE lower(username)=lower(trim(coalesce(p_username,'')));
  IF target_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE='P0002', MESSAGE='Compte introuvable.';
  END IF;
  UPDATE public.profiles SET credits=p_cash WHERE id=target_id;
  RETURN jsonb_build_object(
    'user',public.career_profile_json(target_id),
    'message','Solde administrateur mis à jour dans Supabase.'
  );
END;
$$;

-- Les joueurs n'appellent pas directement la fonction interne qui lit un profil
-- arbitraire ; les fonctions métier SECURITY DEFINER continuent de l'utiliser.
REVOKE ALL ON FUNCTION public.career_profile_json(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.career_is_admin() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.career_admin_list_accounts() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.career_admin_set_cash(text,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.career_is_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_admin_list_accounts() TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_admin_set_cash(text,bigint) TO authenticated;

-- Garantit que la boutique et les récompenses peuvent invoquer les fonctions
-- avec une session Supabase authentifiée.
GRANT EXECUTE ON FUNCTION public.career_update_profile(text,text,integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_purchase_item(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_equip_logo(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.career_award_reward(text,integer,boolean) TO authenticated;

