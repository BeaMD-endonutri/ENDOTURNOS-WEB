-- VAC, PERM and FOR use the existing assignment, publication, history and lock protections.
create or replace function et_private.validate_consultation_staff() returns trigger language plpgsql set search_path='' as $$
begin
 -- Absences describe availability, not a service requiring a preferred clinician.
 if new.id in ('VAC','PERM','FOR') then
  new.preferred_staff_id:=null; new.secondary_staff_ids:='{}'; new.coverage_rules:='[]'::jsonb;
  return new;
 end if;
 if new.preferred_staff_id is null then raise exception 'Selecciona un profesional preferente'; end if;
 if not exists(select 1 from public.et_staff where id=new.preferred_staff_id and active and role='professional') then raise exception 'El profesional preferente debe estar activo'; end if;
 if new.preferred_staff_id=any(new.secondary_staff_ids) or cardinality(new.secondary_staff_ids)>50 or cardinality(new.secondary_staff_ids)<>(select count(distinct x) from unnest(new.secondary_staff_ids) x) or exists(select 1 from unnest(new.secondary_staff_ids) x where x is null or not exists(select 1 from public.et_staff where id=x and active and role='professional')) then raise exception 'Revisa los profesionales secundarios: activos, sin repetir y distintos del preferente'; end if;
 return new;
end; $$;

insert into public.et_consultations(id,label,short_label,color,sort_order,active,default_start_time,default_end_time,coverage_rules)
values ('VAC','Vacaciones','VAC','#b88624',100,true,'08:00','15:00','[]'),
       ('PERM','Permisos','PERM','#a05b87',101,true,'08:00','15:00','[]'),
       ('FOR','Formaciones','FOR','#416eb0',102,true,'08:00','15:00','[]')
on conflict(id) do nothing;

CREATE OR REPLACE FUNCTION public.et_copy_assignments(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare item jsonb; src public.et_assignments; dest date; checks jsonb; prefs text[]; has_profile boolean; copied int:=0; person uuid;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede copiar turnos'; end if;
 if jsonb_typeof(p_rows)<>'array' or jsonb_array_length(p_rows) not between 1 and 200 then raise exception 'Selecciona entre 1 y 200 turnos'; end if;
 -- Same lock namespace as normal assignment and absence writes.
 for person in select distinct a.professional_id from jsonb_array_elements(p_rows) x join public.et_assignments a on a.id=(x->>'source_id')::uuid order by a.professional_id loop perform pg_advisory_xact_lock(hashtextextended(person::text,0));end loop;
 for item in select value from jsonb_array_elements(p_rows) loop
   select * into src from public.et_assignments where id=(item->>'source_id')::uuid for share;
   if not found or src.updated_at is distinct from (item->>'source_updated_at')::timestamptz then raise exception 'Un turno de origen ha cambiado. Revisa de nuevo la vista previa.'; end if;
   dest:=(item->>'target_date')::date;
   if dest is null or dest=src.work_date then raise exception 'Elige una fecha de destino distinta'; end if;
   if src.consultation_id in ('VAC','PERM','FOR') then
    if dest>(select end_date from public.et_planning_settings where id=1) then raise exception 'Fuera del periodo disponible'; end if;
    checks:='{}'::jsonb; has_profile:=true;
   else
   checks:=public.et_copy_rule_check(src.consultation_id,dest,src.start_time,src.end_time);
   if checks->>'blocked' is not null then raise exception 'No se puede copiar: %',checks->>'blocked'; end if;
   select consultation_ids into prefs from public.et_staff_coverage where staff_id=src.professional_id;has_profile:=found;
   if has_profile and not(src.consultation_id=any(prefs)) then raise exception 'La consulta no figura en la ficha de cobertura de esta persona'; end if;
   end if;
   if (not has_profile or checks->>'review' is not null or src.provisional) and not coalesce((item->>'accept_review')::boolean,false) then raise exception 'Confirma la revisión de cadencias, fichas pendientes y turnos provisionales'; end if;
   if exists(select 1 from public.et_assignments where professional_id=src.professional_id and work_date=dest and start_time<src.end_time and end_time>src.start_time) then raise exception 'El destino contiene un turno coincidente. No se ha sobrescrito ni copiado nada. Actualiza la vista previa.'; end if;
   if exists(select 1 from public.et_requests where professional_id=src.professional_id and status='approved' and request_type in ('vacation','permission') and dest between date_from and date_to) then raise exception 'Hay una ausencia aprobada en el destino. Actualiza la vista previa.'; end if;
   perform public.et_save_assignment(jsonb_build_object('professional_id',src.professional_id,'work_date',dest,'consultation_id',src.consultation_id,'start_time',src.start_time,'end_time',src.end_time,'notes',src.notes,'provisional',src.provisional,'is_extra',src.is_extra));
   copied:=copied+1;
 end loop;
 return copied;
end; $function$;
