-- Supabase default privileges may explicitly grant new functions to anon.
-- Revoking PUBLIC alone does not remove that explicit grant.
revoke all on function public.save_race_control(uuid,uuid,jsonb,jsonb,jsonb) from anon;
