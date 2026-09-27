create table public.et_locked_months (
  month date primary key check (extract(day from month)=1),
  locked_at timestamptz not null default now(),
  locked_by uuid not null references auth.users(id)
);
alter table public.et_locked_months enable row level security;
revoke all on public.et_locked_months from anon, authenticated;
grant select, insert on public.et_locked_months to authenticated;
create policy "team reads closed months" on public.et_locked_months
  for select to authenticated using (et_private.current_staff_id() is not null);
create policy "supervisor closes months" on public.et_locked_months
  for insert to authenticated with check (et_private.is_supervisor() and locked_by=(select auth.uid()));

create function et_private.guard_closed_month()
returns trigger language plpgsql security invoker set search_path='' as $$
declare old_date date; new_date date;
begin
  if tg_op <> 'INSERT' then
    old_date:=case when tg_table_name='et_rota_publications' then old.month else old.work_date end;
    if exists(select 1 from public.et_locked_months where month=date_trunc('month',old_date)::date) then
      raise exception 'Este mes está bloqueado permanentemente';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    new_date:=case when tg_table_name='et_rota_publications' then new.month else new.work_date end;
    if exists(select 1 from public.et_locked_months where month=date_trunc('month',new_date)::date) then
      raise exception 'Este mes está bloqueado permanentemente';
    end if;
  end if;
  return case when tg_op='DELETE' then old else new end;
end $$;

create trigger et_guard_closed_draft before insert or update or delete on public.et_assignments
for each row execute function et_private.guard_closed_month();
create trigger et_guard_closed_published before insert or update or delete on public.et_published_assignments
for each row execute function et_private.guard_closed_month();
create trigger et_guard_closed_publication before insert or update or delete on public.et_rota_publications
for each row execute function et_private.guard_closed_month();

create function et_private.validate_month_lock()
returns trigger language plpgsql security invoker set search_path='' as $$
declare p jsonb;
begin
  if not et_private.is_supervisor() or new.locked_by is distinct from auth.uid() then
    raise exception 'Solo supervisión puede bloquear un mes';
  end if;
  lock table public.et_assignments in share row exclusive mode;
  lock table public.et_published_assignments in share row exclusive mode;
  lock table public.et_rota_publications in share row exclusive mode;
  if not exists(select 1 from public.et_rota_publications where month=new.month) then
    raise exception 'Publica el cuadrante antes de bloquear este mes';
  end if;
  p:=public.et_preview_publication(new.month);
  if (p->>'added')::int+(p->>'changed')::int+(p->>'removed')::int>0 then
    raise exception 'Hay cambios pendientes. Publica la última versión antes de bloquear el mes';
  end if;
  if (p->>'blocked')::int>0 then
    raise exception 'Resuelve los conflictos sin justificar antes de bloquear';
  end if;
  new.locked_at:=clock_timestamp();
  return new;
end $$;
create trigger et_validate_month_lock before insert on public.et_locked_months
for each row execute function et_private.validate_month_lock();

revoke truncate on public.et_assignments, public.et_published_assignments, public.et_rota_publications from anon, authenticated, public;
alter publication supabase_realtime add table public.et_locked_months;
