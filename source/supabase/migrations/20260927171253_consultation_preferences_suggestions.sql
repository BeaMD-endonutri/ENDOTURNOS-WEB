-- Existing consultations remain unconfigured until supervision chooses their references.
alter table public.et_consultations add column preferred_staff_id uuid references public.et_staff(id), add column secondary_staff_ids uuid[] not null default '{}';
alter table public.et_staff_coverage add column work_cadences jsonb;

create function et_private.validate_consultation_staff() returns trigger language plpgsql set search_path='' as $$
begin
 if new.preferred_staff_id is null then raise exception 'Selecciona un profesional preferente'; end if;
 if not exists(select 1 from public.et_staff where id=new.preferred_staff_id and active and role='professional') then raise exception 'El profesional preferente debe estar activo'; end if;
 if new.preferred_staff_id=any(new.secondary_staff_ids) or cardinality(new.secondary_staff_ids)>50 or cardinality(new.secondary_staff_ids)<>(select count(distinct x) from unnest(new.secondary_staff_ids) x) or exists(select 1 from unnest(new.secondary_staff_ids) x where x is null or not exists(select 1 from public.et_staff where id=x and active and role='professional')) then raise exception 'Revisa los profesionales secundarios: activos, sin repetir y distintos del preferente'; end if;
 return new;
end; $$;
create trigger et_validate_consultation_staff before insert or update of preferred_staff_id,secondary_staff_ids on public.et_consultations for each row execute function et_private.validate_consultation_staff();

create function et_private.validate_work_cadences() returns trigger language plpgsql set search_path='' as $$
declare r jsonb;
begin
 if new.work_cadences is null then return new; end if;
 if jsonb_typeof(new.work_cadences)<>'array' or jsonb_array_length(new.work_cadences)>30 then raise exception 'Cadencias no válidas'; end if;
 for r in select value from jsonb_array_elements(new.work_cadences) loop
  if not (r ?& array['id','weekdays','start_time','end_time','every_weeks','anchor_date','valid_from','valid_until']) or exists(select 1 from jsonb_each(r) e where e.value='null'::jsonb) then raise exception 'Faltan datos de la cadencia'; end if;
  if jsonb_typeof(r->'weekdays')<>'array' or jsonb_array_length(r->'weekdays')=0 or exists(select 1 from jsonb_array_elements_text(r->'weekdays') d where d::int not between 0 and 6) or (r->>'start_time')::time>=(r->>'end_time')::time or (r->>'every_weeks')::int not between 1 and 4 or (r->>'valid_from')::date>(r->>'valid_until')::date or (r->>'anchor_date')::date is null then raise exception 'Revisa los días, fechas, horario y frecuencia de la cadencia'; end if;
 end loop;
 return new;
end; $$;
create trigger et_validate_work_cadences before insert or update of work_cadences on public.et_staff_coverage for each row execute function et_private.validate_work_cadences();

-- A single database snapshot supplies both the proposal inputs and its concurrency token.
create function public.et_suggestion_context() returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare result jsonb;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede sugerir un cuadrante'; end if;
 select jsonb_build_object(
 'staff',coalesce((select jsonb_agg(to_jsonb(s) order by s.id) from public.et_staff s where s.active and s.role='professional'),'[]'::jsonb),
 'consultations',coalesce((select jsonb_agg(to_jsonb(c) order by c.id) from public.et_consultations c where c.active),'[]'::jsonb),
 'assignments',coalesce((select jsonb_agg(to_jsonb(a) order by a.id) from public.et_assignments a),'[]'::jsonb),
 'requests',coalesce((select jsonb_agg(to_jsonb(r) order by r.id) from public.et_requests r where r.status='approved' and r.request_type in ('vacation','permission')),'[]'::jsonb),
 'profiles',coalesce((select jsonb_agg(to_jsonb(p) order by p.staff_id) from public.et_staff_coverage p),'[]'::jsonb),
 'exceptions',coalesce((select jsonb_agg(to_jsonb(e) order by e.id) from public.et_coverage_exceptions e where e.revoked_at is null),'[]'::jsonb),
 'planning',(select to_jsonb(s) from public.et_planning_settings s where id=1)) into result;
 return result||jsonb_build_object('fingerprint',md5(result::text));
end; $$;
revoke all on function public.et_suggestion_context() from public,anon;
grant execute on function public.et_suggestion_context() to authenticated;

-- Definer is restricted to authenticated supervisors. Locks prevent inputs changing during the atomic save.
create function public.et_apply_suggestion(p_month date,p_fingerprint text,p_rows jsonb) returns int language plpgsql security definer set search_path='' as $$
declare item jsonb; pid uuid; d date; cid text; st time; en time; check_rule jsonb; max_minutes int; used_minutes numeric; snapshot jsonb; count_saved int:=0;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede guardar una propuesta'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_fingerprint is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Propuesta no válida'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'La propuesta debe contener entre 1 y 1000 turnos'; end if;
 -- Block ordinary writes as well as concurrent bulk proposals before taking per-person locks.
 lock table public.et_assignments in share row exclusive mode;
 lock table public.et_consultations,public.et_staff,public.et_staff_coverage,public.et_requests,public.et_planning_settings,public.et_coverage_exceptions in share mode;
 snapshot:=public.et_suggestion_context();
 if snapshot->>'fingerprint' is distinct from p_fingerprint then raise exception 'Han cambiado los turnos, las preferencias o la disponibilidad. Vuelve a sugerir el cuadrante antes de guardar.'; end if;
 for pid in select distinct (value->>'professional_id')::uuid from jsonb_array_elements(p_rows) order by 1 loop perform pg_advisory_xact_lock(hashtextextended(pid::text,0)); end loop;
 for item in select value from jsonb_array_elements(p_rows) loop
  pid:=(item->>'professional_id')::uuid;d:=(item->>'work_date')::date;cid:=item->>'consultation_id';st:=(item->>'start_time')::time;en:=(item->>'end_time')::time;
  if pid is null or cid is null or d is null or st is null or en is null or st>=en or d<p_month or d>=(p_month+interval '1 month')::date then raise exception 'Turno fuera del mes o con horario no válido'; end if;
  select weekly_minutes into max_minutes from public.et_staff where id=pid and active and role='professional';
  if not found or not exists(select 1 from public.et_consultations where id=cid and active and preferred_staff_id is not null and (preferred_staff_id=pid or pid=any(secondary_staff_ids))) then raise exception 'El profesional no figura entre las referencias activas de la consulta'; end if;
  if not exists(select 1 from public.et_staff_coverage p cross join lateral jsonb_array_elements(coalesce(p.work_cadences,'[]'::jsonb)) r where p.staff_id=pid and cid=any(p.consultation_ids) and d between (r->>'valid_from')::date and (r->>'valid_until')::date and (r->'weekdays') @> to_jsonb(array[extract(dow from d)::int]) and st>=(r->>'start_time')::time and en<=(r->>'end_time')::time and mod((date_trunc('week',d::timestamp)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7,(r->>'every_weeks')::int)=0) then raise exception 'El turno no respeta las consultas o cadencias del profesional'; end if;
  check_rule:=public.et_copy_rule_check(cid,d,st,en);
  if check_rule ? 'blocked' or (check_rule->>'review')='Fuera de la cadencia o sin regla de cobertura' then raise exception 'El turno no respeta la apertura de la consulta: %',check_rule; end if;
  select coalesce(sum(extract(epoch from (end_time-start_time))/60),0) into used_minutes from public.et_assignments where professional_id=pid and work_date between date_trunc('week',d::timestamp)::date and date_trunc('week',d::timestamp)::date+6;
  if used_minutes+extract(epoch from (en-st))/60>max_minutes then raise exception 'La propuesta supera la jornada semanal del profesional'; end if;
  -- Ignore client notes, override flags and IDs: suggestions can never bypass conflict checks.
  perform public.et_save_assignment(jsonb_build_object('professional_id',pid,'work_date',d,'consultation_id',cid,'start_time',st,'end_time',en,'provisional',true,'notes',null,'override_reason',null));
  count_saved:=count_saved+1;
 end loop;
 return count_saved;
end; $$;
revoke all on function public.et_apply_suggestion(date,text,jsonb) from public,anon;
grant execute on function public.et_apply_suggestion(date,text,jsonb) to authenticated;
