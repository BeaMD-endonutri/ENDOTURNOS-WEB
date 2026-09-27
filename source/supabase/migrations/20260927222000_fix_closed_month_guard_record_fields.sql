create or replace function et_private.guard_closed_month()
returns trigger language plpgsql security invoker set search_path='' as $$
declare old_date date; new_date date;
begin
  if tg_op <> 'INSERT' then
    if tg_table_name='et_rota_publications' then old_date:=old.month;
    else old_date:=old.work_date; end if;
    if exists(select 1 from public.et_locked_months where month=date_trunc('month',old_date)::date) then
      raise exception 'Este mes está bloqueado permanentemente';
    end if;
  end if;
  if tg_op <> 'DELETE' then
    if tg_table_name='et_rota_publications' then new_date:=new.month;
    else new_date:=new.work_date; end if;
    if exists(select 1 from public.et_locked_months where month=date_trunc('month',new_date)::date) then
      raise exception 'Este mes está bloqueado permanentemente';
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end $$;
