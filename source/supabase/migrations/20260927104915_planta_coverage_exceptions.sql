create table public.et_coverage_exceptions (
 id uuid primary key default gen_random_uuid(),
 work_date date not null,
 consultation_id text not null references public.et_consultations(id) check (consultation_id='PLANTA'),
 rule_id text not null,
 rule_snapshot jsonb not null,
 reason text not null check (char_length(btrim(reason)) between 3 and 1000),
 created_by uuid not null default auth.uid(),
 created_by_name text not null default '',
 created_at timestamptz not null default now(),
 revoked_at timestamptz,
 revoked_by uuid
);
create unique index et_coverage_exception_active on public.et_coverage_exceptions(work_date,consultation_id,rule_id) where revoked_at is null;
alter table public.et_coverage_exceptions enable row level security;
revoke all on public.et_coverage_exceptions from anon,authenticated;
grant select,insert on public.et_coverage_exceptions to authenticated;
grant update(revoked_at) on public.et_coverage_exceptions to authenticated;
create policy "supervisors read exceptions" on public.et_coverage_exceptions for select to authenticated using (et_private.is_supervisor());
create policy "supervisors create exceptions" on public.et_coverage_exceptions for insert to authenticated with check (et_private.is_supervisor() and created_by=auth.uid());
create policy "supervisors revoke exceptions" on public.et_coverage_exceptions for update to authenticated using (et_private.is_supervisor()) with check (et_private.is_supervisor());
create function et_private.guard_coverage_exception() returns trigger language plpgsql security invoker set search_path='' as $$
declare r jsonb; min_cover integer;
begin
 if not et_private.is_supervisor() or auth.uid() is null then raise exception 'Solo supervisión puede gestionar excepciones.'; end if;
 if TG_OP='UPDATE' then
  if old.revoked_at is not null or new.revoked_at is null then raise exception 'Esta excepción ya está retirada.'; end if;
  new.revoked_at:=now(); new.revoked_by:=auth.uid(); return new;
 end if;
 select rule into r from public.et_consultations c cross join lateral jsonb_array_elements(c.coverage_rules) rule where c.id='PLANTA' and c.active and rule->>'id'=new.rule_id;
 if r is null or r<>new.rule_snapshot or (r->>'min_staff')::integer<>2 or coalesce((r->>'monthly')::boolean,false) or jsonb_array_length(coalesce(r->'alternatives','[]'::jsonb))>0 then raise exception 'La regla de Planta ha cambiado. Actualiza los datos.'; end if;
 if new.work_date not between (r->>'valid_from')::date and (r->>'valid_until')::date or not (r->'weekdays' @> to_jsonb(extract(dow from new.work_date)::integer)) or exists(select 1 from jsonb_array_elements(r->'suspensions') s where new.work_date between (s->>'from')::date and (s->>'to')::date) then raise exception 'La fecha no corresponde a esta regla activa.'; end if;
 with eligible as (
  select a.* from public.et_assignments a where a.consultation_id='PLANTA' and a.work_date=new.work_date
  and not exists(select 1 from public.et_requests q where q.professional_id=a.professional_id and q.status='approved' and q.request_type in ('vacation','permission') and new.work_date between q.date_from and q.date_to)
 ), points as (
  select (r->>'start_time')::time t union select (r->>'end_time')::time union select start_time from eligible union select end_time from eligible
 ), segments as (
  select t,lead(t) over(order by t) ending from points where t between (r->>'start_time')::time and (r->>'end_time')::time
 ) select min((select count(distinct a.professional_id)::integer from eligible a where a.start_time<=s.t and a.end_time>=s.ending)) into min_cover from segments s where ending is not null;
 if min_cover is distinct from 1 then raise exception 'La cobertura ha cambiado. Solo se admite la excepción con una enfermera durante toda la franja.'; end if;
 new.reason:=btrim(new.reason);new.created_by:=auth.uid();new.created_at:=now();new.revoked_at:=null;new.revoked_by:=null;
 select display_name into new.created_by_name from public.et_staff where user_id=auth.uid() and active;
 return new;
end $$;
revoke all on function et_private.guard_coverage_exception() from public;
create trigger guard_coverage_exception before insert or update on public.et_coverage_exceptions for each row execute function et_private.guard_coverage_exception();
alter publication supabase_realtime add table public.et_coverage_exceptions;
