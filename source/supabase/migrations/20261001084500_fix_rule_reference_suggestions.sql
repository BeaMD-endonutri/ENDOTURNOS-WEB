-- Rule-level preferred/secondary staff are planning preferences, not an authorization boundary.
-- The previous version still checked deprecated consultation-level references, which are now
-- intentionally cleared when rules are saved. That made valid suggested rota rows fail at save time.
create or replace function public.et_apply_suggestion(p_month date,p_fingerprint text,p_rows jsonb) returns int
language plpgsql security definer set search_path='' as $$
declare item jsonb; pid uuid; d date; cid text; st time; en time; check_rule jsonb; max_minutes int; used_minutes numeric; snapshot jsonb; count_saved int:=0;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede guardar una propuesta'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_fingerprint is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Propuesta no válida'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'La propuesta debe contener entre 1 y 1000 turnos'; end if;

 lock table public.et_assignments in share row exclusive mode;
 lock table public.et_consultations,public.et_staff,public.et_staff_coverage,public.et_requests,public.et_planning_settings,public.et_coverage_exceptions in share mode;

 snapshot:=public.et_suggestion_context();
 if snapshot->>'fingerprint' is distinct from p_fingerprint then raise exception 'Han cambiado los turnos, las preferencias o la disponibilidad. Vuelve a sugerir el cuadrante antes de guardar.'; end if;

 for pid in select distinct (value->>'professional_id')::uuid from jsonb_array_elements(p_rows) order by 1 loop
  perform pg_advisory_xact_lock(hashtextextended(pid::text,0));
 end loop;

 for item in select value from jsonb_array_elements(p_rows) loop
  pid:=(item->>'professional_id')::uuid;
  d:=(item->>'work_date')::date;
  cid:=item->>'consultation_id';
  st:=(item->>'start_time')::time;
  en:=(item->>'end_time')::time;

  if pid is null or cid is null or d is null or st is null or en is null or st>=en or d<p_month or d>=(p_month+interval '1 month')::date then
   raise exception 'Turno fuera del mes o con horario no válido';
  end if;

  select weekly_minutes into max_minutes
  from public.et_staff
  where id=pid and active and role='professional';
  if not found then
   raise exception 'El profesional propuesto no está activo';
  end if;

  if not exists(select 1 from public.et_consultations where id=cid and active) then
   raise exception 'La consulta propuesta no está activa';
  end if;

  if not exists(
   select 1
   from public.et_staff_coverage p
   cross join lateral jsonb_array_elements(coalesce(p.work_cadences,'[]'::jsonb)) r
   where p.staff_id=pid
     and cid=any(p.consultation_ids)
     and d between (r->>'valid_from')::date and (r->>'valid_until')::date
     and (r->'weekdays') @> to_jsonb(array[extract(dow from d)::int])
     and st>=(r->>'start_time')::time
     and en<=(r->>'end_time')::time
     and mod((date_trunc('week',d::timestamp)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7,(r->>'every_weeks')::int)=0
  ) then
   raise exception 'El turno no respeta las consultas o cadencias del profesional';
  end if;

  check_rule:=public.et_copy_rule_check(cid,d,st,en);
  if check_rule ? 'blocked' or (check_rule->>'review')='Fuera de la cadencia o sin regla de cobertura' then
   raise exception 'El turno no respeta la apertura de la consulta: %',check_rule;
  end if;

  select coalesce(sum(extract(epoch from (end_time-start_time))/60),0)
  into used_minutes
  from public.et_assignments
  where professional_id=pid
    and work_date between date_trunc('week',d::timestamp)::date and date_trunc('week',d::timestamp)::date+6;

  if used_minutes+extract(epoch from (en-st))/60>max_minutes then
   raise exception 'La propuesta supera la jornada semanal del profesional';
  end if;

  perform public.et_save_assignment(jsonb_build_object(
   'professional_id',pid,'work_date',d,'consultation_id',cid,
   'start_time',st,'end_time',en,'provisional',true,
   'notes',null,'override_reason',null
  ));
  count_saved:=count_saved+1;
 end loop;

 return count_saved;
end;
$$;

revoke all on function public.et_apply_suggestion(date,text,jsonb) from public,anon;
grant execute on function public.et_apply_suggestion(date,text,jsonb) to authenticated;
