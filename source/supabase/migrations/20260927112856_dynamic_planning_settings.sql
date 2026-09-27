create table public.et_planning_settings(
 id integer primary key default 1 check(id=1),
 start_date date not null, end_date date not null,
 holidays jsonb not null default '{}'::jsonb check(jsonb_typeof(holidays)='object'),
 updated_at timestamptz not null default now(),updated_by uuid default auth.uid(),
 check(start_date=date_trunc('month',start_date)::date),
 check(end_date=(date_trunc('month',end_date)+interval '1 month - 1 day')::date),
 check(end_date>=start_date and end_date<start_date+interval '24 months')
);
insert into public.et_planning_settings(id,start_date,end_date,holidays) values(1,'2026-10-01','2026-12-31','{"2026-10-12":"Fiesta Nacional","2026-11-02":"Todos los Santos (traslado)","2026-12-07":"Constitución (traslado)","2026-12-08":"Inmaculada","2026-12-24":"Festivo contemplado","2026-12-25":"Navidad","2026-12-31":"Festivo contemplado"}');
alter table public.et_planning_settings enable row level security;
revoke all on public.et_planning_settings from anon,authenticated;
grant select on public.et_planning_settings to authenticated;
grant update(start_date,end_date,holidays) on public.et_planning_settings to authenticated;
create policy "team reads planning settings" on public.et_planning_settings for select to authenticated using(et_private.current_staff_id() is not null);
create policy "supervisor updates planning settings" on public.et_planning_settings for update to authenticated using(et_private.is_supervisor()) with check(et_private.is_supervisor());
create function et_private.validate_planning_settings() returns trigger language plpgsql security invoker set search_path='' as $$
declare item record;
begin
 if not et_private.is_supervisor() then raise exception 'Solo supervisión puede cambiar la configuración'; end if;
 if (select count(*) from jsonb_each(new.holidays))>1000 then raise exception 'Demasiados festivos'; end if;
 for item in select key,value from jsonb_each(new.holidays) loop
  if item.key !~ '^\d{4}-\d{2}-\d{2}$' or to_char(item.key::date,'YYYY-MM-DD')<>item.key or jsonb_typeof(item.value)<>'string' or length(btrim(item.value#>>'{}')) not between 1 and 100 then raise exception 'Revisa la fecha y el nombre del festivo'; end if;
 end loop;
 new.updated_at:=clock_timestamp();new.updated_by:=auth.uid();return new;
end $$;
revoke all on function et_private.validate_planning_settings() from public;
create trigger validate_planning_settings before update on public.et_planning_settings for each row execute function et_private.validate_planning_settings();
alter publication supabase_realtime add table public.et_planning_settings;
CREATE OR REPLACE FUNCTION public.et_copy_rule_check(p_consultation text, p_date date, p_start time without time zone, p_end time without time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare r jsonb; s jsonb; matched boolean:=false; monthly boolean:=false; n int; w int;
begin
 if et_private.current_staff_id() is null then raise exception 'Acceso no autorizado'; end if;
 if not exists(select 1 from public.et_planning_settings where id=1 and p_date between start_date and end_date) then return '{"blocked":"Fuera del periodo disponible"}'::jsonb; end if;
 if exists(select 1 from public.et_planning_settings where id=1 and holidays ? to_char(p_date,'YYYY-MM-DD')) then return '{"blocked":"Festivo"}'::jsonb; end if;
 if not exists(select 1 from public.et_consultations where id=p_consultation and active) then return '{"blocked":"Consulta no activa"}'::jsonb; end if;
 for r in select rr.value from public.et_consultations c cross join lateral jsonb_array_elements(coalesce(c.coverage_rules,'[]'::jsonb)) rr where c.active and (c.id=p_consultation or coalesce(rr.value->'alternatives','[]'::jsonb) ? p_consultation) loop
   if p_start < (r->>'end_time')::time and p_end > (r->>'start_time')::time then
     for s in select value from jsonb_array_elements(r->'suspensions') loop
       if p_date between (s->>'from')::date and (s->>'to')::date then return '{"blocked":"Franja suspendida"}'::jsonb; end if;
     end loop;
   end if;
   w:=((date_trunc('week',p_date::timestamp)::date-date_trunc('week',(r->>'anchor_date')::timestamp)::date)/7);
   if p_date between (r->>'valid_from')::date and (r->>'valid_until')::date and (r->'weekdays') @> to_jsonb(array[extract(dow from p_date)::int]) and p_start=(r->>'start_time')::time and p_end=(r->>'end_time')::time and ((r->>'monthly')::boolean or mod(w,(r->>'every_weeks')::int)=0) then
     matched:=true;monthly:=monthly or (r->>'monthly')::boolean;
   end if;
 end loop;
 return jsonb_build_object('review',case when not matched then 'Fuera de la cadencia o sin regla de cobertura' when monthly then 'Sesión mensual: revisar que no se repita innecesariamente' else null end);
end; $function$
