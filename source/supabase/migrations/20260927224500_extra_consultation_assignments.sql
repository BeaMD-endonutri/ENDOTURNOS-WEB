alter table public.et_assignments add column is_extra boolean not null default false;
alter table public.et_published_assignments add column is_extra boolean not null default false;

CREATE OR REPLACE FUNCTION public.et_save_assignment(p_data jsonb, p_id uuid DEFAULT NULL::uuid, p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare result_id uuid; existing public.et_assignments;
begin
  if not et_private.is_supervisor() then raise exception 'Solo supervisión puede gestionar el cuadrante'; end if;
  if p_id is not null then
    select * into existing from public.et_assignments where id=p_id for update;
    if not found or existing.updated_at is distinct from p_expected_updated_at then raise exception 'Este turno ha cambiado. Cierra el panel y vuelve a abrirlo antes de guardar.'; end if;
    update public.et_assignments set professional_id=(p_data->>'professional_id')::uuid,work_date=(p_data->>'work_date')::date,consultation_id=p_data->>'consultation_id',start_time=(p_data->>'start_time')::time,end_time=(p_data->>'end_time')::time,notes=p_data->>'notes',provisional=coalesce((p_data->>'provisional')::boolean,false),is_extra=coalesce((p_data->>'is_extra')::boolean,false),override_reason=p_data->>'override_reason' where id=p_id returning id into result_id;
  else
    insert into public.et_assignments(professional_id,work_date,consultation_id,start_time,end_time,notes,provisional,override_reason,is_extra) values((p_data->>'professional_id')::uuid,(p_data->>'work_date')::date,p_data->>'consultation_id',(p_data->>'start_time')::time,(p_data->>'end_time')::time,p_data->>'notes',coalesce((p_data->>'provisional')::boolean,false),p_data->>'override_reason',coalesce((p_data->>'is_extra')::boolean,false)) returning id into result_id;
  end if;
  return result_id;
end; $function$;
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
   checks:=public.et_copy_rule_check(src.consultation_id,dest,src.start_time,src.end_time);
   if checks->>'blocked' is not null then raise exception 'No se puede copiar: %',checks->>'blocked'; end if;
   select consultation_ids into prefs from public.et_staff_coverage where staff_id=src.professional_id;has_profile:=found;
   if has_profile and not(src.consultation_id=any(prefs)) then raise exception 'La consulta no figura en la ficha de cobertura de esta persona'; end if;
   if (not has_profile or checks->>'review' is not null or src.provisional) and not coalesce((item->>'accept_review')::boolean,false) then raise exception 'Confirma la revisión de cadencias, fichas pendientes y turnos provisionales'; end if;
   if exists(select 1 from public.et_assignments where professional_id=src.professional_id and work_date=dest and start_time<src.end_time and end_time>src.start_time) then raise exception 'El destino contiene un turno coincidente. No se ha sobrescrito ni copiado nada. Actualiza la vista previa.'; end if;
   if exists(select 1 from public.et_requests where professional_id=src.professional_id and status='approved' and request_type in ('vacation','permission') and dest between date_from and date_to) then raise exception 'Hay una ausencia aprobada en el destino. Actualiza la vista previa.'; end if;
   perform public.et_save_assignment(jsonb_build_object('professional_id',src.professional_id,'work_date',dest,'consultation_id',src.consultation_id,'start_time',src.start_time,'end_time',src.end_time,'notes',src.notes,'provisional',src.provisional,'is_extra',src.is_extra));
   copied:=copied+1;
 end loop;
 return copied;
end; $function$;
CREATE OR REPLACE FUNCTION public.et_undo_assignment(p_history_id uuid, p_reason text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare h public.et_assignment_history; current_row public.et_assignments; b jsonb;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede restaurar turnos'; end if;
 select * into h from public.et_assignment_history where id=p_history_id;
 if not found then raise exception 'Cambio no encontrado'; end if;
 perform pg_advisory_xact_lock(hashtextextended(h.assignment_id::text,1));
 if exists(select 1 from public.et_assignment_history where assignment_id=h.assignment_id and changed_at>h.changed_at) then raise exception 'Hay cambios posteriores en este turno. Revisa el último cambio del historial.'; end if;
 select * into current_row from public.et_assignments where id=h.assignment_id for update;
 if h.action='DELETE' then
   if found then raise exception 'El turno ya ha sido recuperado'; end if;
 else
   if not found or to_jsonb(current_row) is distinct from h.after_data then raise exception 'El turno ha cambiado desde entonces. No se puede deshacer esta versión.'; end if;
 end if;
 if h.action='INSERT' then delete from public.et_assignments where id=h.assignment_id; return; end if;
 b:=h.before_data;
 if h.action='DELETE' then
   insert into public.et_assignments(id,professional_id,work_date,consultation_id,start_time,end_time,notes,provisional,override_reason,is_extra)
   values(h.assignment_id,(b->>'professional_id')::uuid,(b->>'work_date')::date,b->>'consultation_id',(b->>'start_time')::time,(b->>'end_time')::time,b->>'notes',(b->>'provisional')::boolean,p_reason,coalesce((b->>'is_extra')::boolean,false));
 else
   perform public.et_save_assignment(b || jsonb_build_object('override_reason',p_reason),h.assignment_id,current_row.updated_at);
 end if;
end; $function$;
