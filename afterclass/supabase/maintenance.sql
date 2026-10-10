-- Run periodically through an authorized scheduled DB job. Keep the interval in
-- sync with DATA_RETENTION_DAYS. On-access app pruning does not clean inactive owners.
delete from public.reflections where created_at < now()-interval '365 days';
delete from public.opportunity_feedback where updated_at < now()-interval '365 days';
delete from public.request_limits where window_start < now()-interval '2 days';
-- Optional stale anonymous profile cleanup. Auth-backed profiles are kept until
-- deletion by the student; there is no automatic Supabase Auth account deletion.
delete from public.student_profiles p
where p.updated_at < now()-interval '365 days'
  and not exists (select 1 from auth.users u where u.id=p.owner_id)
  and not exists (select 1 from public.reflections r where r.session_id=p.owner_id)
  and not exists (select 1 from public.opportunity_feedback f where f.session_id=p.owner_id);