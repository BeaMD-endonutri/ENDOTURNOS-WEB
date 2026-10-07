CREATE OR REPLACE FUNCTION et_private.validate_work_cadences()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare r jsonb;
begin
 if new.work_cadences is null then return new; end if;
 if jsonb_typeof(new.work_cadences)<>'array' or jsonb_array_length(new.work_cadences)>30 then raise exception 'Cadencias no válidas'; end if;
 for r in select value from jsonb_array_elements(new.work_cadences) loop
  if coalesce(r->>'kind','work') not in ('work','rest') then raise exception 'Tipo de cadencia no válido'; end if;
  if not (r ?& array['id','weekdays','start_time','end_time','every_weeks','anchor_date','valid_from','valid_until']) or exists(select 1 from jsonb_each(r) e where e.value='null'::jsonb) then raise exception 'Faltan datos de la cadencia'; end if;
  if jsonb_typeof(r->'weekdays')<>'array' or jsonb_array_length(r->'weekdays')=0 or exists(select 1 from jsonb_array_elements_text(r->'weekdays') d where d::int not between 0 and 6) or (r->>'start_time')::time>=(r->>'end_time')::time or (r->>'every_weeks')::int not between 1 and 4 or (r->>'valid_from')::date>(r->>'valid_until')::date or (r->>'anchor_date')::date is null then raise exception 'Revisa los días, fechas, horario y frecuencia de la cadencia'; end if;
 end loop;
 return new;
end; $function$
;

CREATE OR REPLACE FUNCTION public.et_apply_suggestion(p_month date, p_fingerprint text, p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
 item jsonb; pid uuid; d date; cid text; st time; en time; check_rule jsonb;
 contract_minutes int; cadence_minutes numeric; max_minutes numeric; used_minutes numeric;
 snapshot jsonb; count_saved int:=0;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede guardar una propuesta'; end if;
 if p_month is null or p_month<>date_trunc('month',p_month)::date or p_fingerprint is null or jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Propuesta no válida'; end if;
 if jsonb_array_length(p_rows) not between 1 and 1000 then raise exception 'La propuesta debe contener entre 1 y 1000 turnos'; end if;

 lock table public.et_assignments in share row exclusive mode;
 lock table public.et_consultations,public.et_staff,public.et_staff_coverage,public.et_requests,public.et_planning_settings,public.et_coverage_exceptions in share mode;

 snapshot:=public.et_suggestion_context();
 if snapshot->>'fingerprint' is distinct from p_fingerprint then
  raise exception 'Han cambiado los turnos, las preferencias o la disponibilidad. Vuelve a sugerir el cuadrante antes de guardar.';
 end if;

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

  select weekly_minutes into contract_minutes
  from public.et_staff
  where id=pid and active and role='professional';
  if not found then raise exception 'El profesional propuesto no está activo'; end if;

  if not exists(select 1 from public.et_consultations where id=cid and active) then
   raise exception 'La consulta propuesta no está activa';
  end if;


  if exists (
   select 1 from public.et_staff_coverage p
   cross join lateral jsonb_array_elements(coalesce(p.work_cadences,'[]'::jsonb)) r
   where p.staff_id=pid and r->>'kind'='rest'
     and d between (r->>'valid_from')::date and (r->>'valid_until')::date
     and (r->'weekdays') @> to_jsonb(array[extract(dow from d)::int])
     and st<(r->>'end_time')::time and en>(r->>'start_time')::time
     and mod((date_trunc('week',d::timestamp)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7,(r->>'every_weeks')::int)=0
  ) then raise exception 'El turno coincide con un descanso recurrente del profesional'; end if;

  if not exists(
   select 1
   from public.et_staff_coverage p
   cross join lateral jsonb_array_elements(coalesce(p.work_cadences,'[]'::jsonb)) r
   where p.staff_id=pid and coalesce(r->>'kind','work')='work'
     and cid=any(p.consultation_ids)
     and d between (r->>'valid_from')::date and (r->>'valid_until')::date
     and (r->'weekdays') @> to_jsonb(array[extract(dow from d)::int])
     and st>=(r->>'start_time')::time
     and en<=(r->>'end_time')::time
     and mod((date_trunc('week',d::timestamp)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7,(r->>'every_weeks')::int)=0
  )
  and not exists(
   select 1
   from public.et_consultations c
   cross join lateral jsonb_array_elements(coalesce(c.coverage_rules,'[]'::jsonb)) cr
   where c.id=cid
     and jsonb_array_length(coalesce(cr->'preferred_staff_ids','[]'::jsonb))>0
     and (coalesce(cr->'secondary_staff_ids','[]'::jsonb)) @> to_jsonb(array[pid::text])
     and d between (cr->>'valid_from')::date and (cr->>'valid_until')::date
     and (cr->'weekdays') @> to_jsonb(array[extract(dow from d)::int])
     and st>=(cr->>'start_time')::time
     and en<=(cr->>'end_time')::time
     and mod((date_trunc('week',d::timestamp)::date-date_trunc('week',(cr->>'anchor_date')::timestamp)::date)/7,(cr->>'every_weeks')::int)=0
     and not exists(
       select 1
       from jsonb_array_elements_text(coalesce(cr->'preferred_staff_ids','[]'::jsonb)) pref
       where not (
         exists(
           select 1 from public.et_assignments a
           where a.professional_id=pref.value::uuid
             and a.work_date=d
             and a.consultation_id in ('VAC','PERM','FOR','DESCANSO')
             and a.start_time<en and a.end_time>st
         )
         or exists(
           select 1 from public.et_requests rq
           where rq.professional_id=pref.value::uuid
             and rq.status='approved'
             and rq.request_type in ('vacation','permission')
             and rq.date_from<=d and rq.date_to>=d
         )
       )
     )
  ) then
   raise exception 'El turno no respeta las consultas o cadencias del profesional';
  end if;

  check_rule:=public.et_copy_rule_check(cid,d,st,en);
  if check_rule ? 'blocked' or (check_rule->>'review')='Fuera de la cadencia o sin regla de cobertura' then
   raise exception 'El turno no respeta la apertura de la consulta: %',check_rule;
  end if;

  select coalesce(sum(extract(epoch from (x.en-x.st))/60),0)
  into cadence_minutes
  from (
    select distinct gs::date as work_date,
           (r->>'start_time')::time as st,
           (r->>'end_time')::time as en
    from public.et_staff_coverage p
    cross join generate_series(
      date_trunc('week',d::timestamp)::date,
      date_trunc('week',d::timestamp)::date+6,
      interval '1 day'
    ) gs
    cross join lateral jsonb_array_elements(coalesce(p.work_cadences,'[]'::jsonb)) r
    where p.staff_id=pid and coalesce(r->>'kind','work')='work'
      and gs::date between (r->>'valid_from')::date and (r->>'valid_until')::date
      and (r->'weekdays') @> to_jsonb(array[extract(dow from gs)::int])
      and mod((date_trunc('week',gs)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7,(r->>'every_weeks')::int)=0
  ) x;

  max_minutes:=greatest(contract_minutes,coalesce(cadence_minutes,0));

  select coalesce(sum(extract(epoch from (end_time-start_time))/60),0)
  into used_minutes
  from public.et_assignments
  where professional_id=pid
    and work_date between date_trunc('week',d::timestamp)::date and date_trunc('week',d::timestamp)::date+6
    and consultation_id not in ('VAC','PERM','FOR','DESCANSO');

  if used_minutes+extract(epoch from (en-st))/60>max_minutes then
   raise warning 'La propuesta supera la jornada semanal o la capacidad prevista por la cadencia del profesional % en %', pid, d;
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
$function$
;
