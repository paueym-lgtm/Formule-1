-- Paulogames F1 : récompenses de course en euros.
-- Exécuter une fois dans Supabase > SQL Editor.
-- 1er = 1 000 €, 2e = 500 €, 3e = 100 € ; disqualification = 0 €.
CREATE OR REPLACE FUNCTION public.career_award_reward(
  p_run_id text,
  p_position integer,
  p_disqualified boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  uid uuid := auth.uid();
  prize bigint;
  inserted_amount bigint;
  new_profile jsonb;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Connecte-toi pour continuer.'; END IF;
  IF coalesce(trim(p_run_id),'')='' OR length(p_run_id)>120 THEN RAISE EXCEPTION 'Identifiant de course invalide.'; END IF;
  IF p_position<1 OR p_position>99 THEN RAISE EXCEPTION 'Position de course invalide.'; END IF;

  prize := CASE
    WHEN coalesce(p_disqualified,false) THEN 0
    WHEN p_position=1 THEN 1000
    WHEN p_position=2 THEN 500
    WHEN p_position=3 THEN 100
    ELSE 0
  END;

  INSERT INTO public.player_race_rewards(player_id,run_id,position,amount)
    VALUES(uid,p_run_id,p_position,prize)
    ON CONFLICT(player_id,run_id) DO NOTHING
    RETURNING amount INTO inserted_amount;

  IF FOUND THEN
    IF inserted_amount>0 THEN
      UPDATE public.profiles SET credits=credits+inserted_amount WHERE id=uid;
    END IF;
    new_profile := public.career_profile_json(uid);
    RETURN jsonb_build_object(
      'user',new_profile,
      'reward',inserted_amount,
      'message',CASE WHEN inserted_amount>0
        THEN 'Récompense créditée et sauvegardée.'
        ELSE 'Course enregistrée sans récompense financière.'
      END
    );
  END IF;

  RETURN jsonb_build_object(
    'user',public.career_profile_json(uid),
    'reward',0,
    'message','Cette course a déjà été enregistrée pour ce compte.'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.career_award_reward(text,integer,boolean) TO authenticated;
