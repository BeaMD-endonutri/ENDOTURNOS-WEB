create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.et_scheduled_broadcasts (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'Recordatorio' check (char_length(title) between 1 and 120),
  message text not null check (char_length(message) between 3 and 1200),
  recipient_ids uuid[] not null check (cardinality(recipient_ids) > 0),
  schedule_type text not null check (schedule_type in ('once','weekly')),
  scheduled_for timestamptz,
  weekday smallint,
  local_time time without time zone,
  timezone text not null default 'Europe/Madrid',
  next_run_at timestamptz not null,
  active boolean not null default true,
  created_by uuid not null references auth.users(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_sent_at timestamptz,
  constraint et_scheduled_broadcast_shape check (
    (schedule_type='once' and scheduled_for is not null and weekday is null and local_time is null)
    or
    (schedule_type='weekly' and scheduled_for is null and weekday between 0 and 6 and local_time is not null)
  )
);

create index if not exists et_scheduled_broadcasts_due_idx
  on public.et_scheduled_broadcasts(next_run_at) where active;

alter table public.et_scheduled_broadcasts enable row level security;
create policy "supervisor views scheduled broadcasts" on public.et_scheduled_broadcasts for select to authenticated using ((select et_private.is_supervisor()));
create policy "supervisor deletes scheduled broadcasts" on public.et_scheduled_broadcasts for delete to authenticated using ((select et_private.is_supervisor()));
grant select, delete on public.et_scheduled_broadcasts to authenticated;
grant all on public.et_scheduled_broadcasts to service_role;

create trigger et_scheduled_broadcasts_updated_at before update on public.et_scheduled_broadcasts for each row execute function et_private.set_updated_at();

alter table public.et_broadcasts
  add column if not exists scheduled_source_id uuid references public.et_scheduled_broadcasts(id) on delete set null,
  add column if not exists push_sent_at timestamptz;

create or replace function et_private.next_weekly_broadcast_run(p_weekday integer,p_local_time time without time zone,p_from timestamptz default now())
returns timestamptz language plpgsql stable set search_path='' as $$
declare local_now timestamp without time zone; candidate timestamp without time zone; days_ahead integer;
begin
  if p_weekday not between 0 and 6 then raise exception 'Invalid weekday'; end if;
  local_now:=timezone('Europe/Madrid',p_from);
  days_ahead:=(p_weekday-extract(dow from local_now)::integer+7)%7;
  candidate:=(local_now::date+days_ahead)+p_local_time;
  if candidate<=local_now then candidate:=candidate+interval '7 days'; end if;
  return candidate at time zone 'Europe/Madrid';
end $$;

create or replace function public.et_create_scheduled_broadcast(p_title text,p_message text,p_recipient_ids uuid[],p_schedule_type text,p_scheduled_for timestamptz default null,p_weekday integer default null,p_local_time time without time zone default null)
returns uuid language plpgsql security invoker set search_path='' as $$
declare new_id uuid; valid_count integer; next_run timestamptz;
begin
  if auth.uid() is null or not et_private.is_supervisor() then raise exception 'Supervisor access required'; end if;
  if char_length(trim(coalesce(p_message,'')))<3 then raise exception 'Message is required'; end if;
  select count(*) into valid_count from public.et_staff s where s.id=any(coalesce(p_recipient_ids,array[]::uuid[])) and s.active and s.role='professional';
  if valid_count=0 then raise exception 'Choose at least one valid recipient'; end if;
  if p_schedule_type='once' then
    if p_scheduled_for is null or p_scheduled_for<=now() then raise exception 'Choose a future date and time'; end if;
    next_run:=p_scheduled_for;
  elsif p_schedule_type='weekly' then
    if p_weekday is null or p_weekday not between 0 and 6 or p_local_time is null then raise exception 'Choose weekday and time'; end if;
    next_run:=et_private.next_weekly_broadcast_run(p_weekday,p_local_time,now());
  else raise exception 'Invalid schedule type'; end if;
  insert into public.et_scheduled_broadcasts(title,message,recipient_ids,schedule_type,scheduled_for,weekday,local_time,next_run_at)
  values(coalesce(nullif(trim(p_title),''),'Recordatorio'),trim(p_message),
    array(select s.id from public.et_staff s where s.id=any(p_recipient_ids) and s.active and s.role='professional' order by s.id),
    p_schedule_type,case when p_schedule_type='once' then p_scheduled_for else null end,
    case when p_schedule_type='weekly' then p_weekday else null end,
    case when p_schedule_type='weekly' then p_local_time else null end,next_run)
  returning id into new_id;
  return new_id;
end $$;
revoke all on function public.et_create_scheduled_broadcast(text,text,uuid[],text,timestamptz,integer,time without time zone) from public,anon;
grant execute on function public.et_create_scheduled_broadcast(text,text,uuid[],text,timestamptz,integer,time without time zone) to authenticated;

create or replace function et_private.process_scheduled_broadcasts()
returns integer language plpgsql security definer set search_path='' as $$
declare item record; broadcast_id uuid; recipient_count integer; processed integer:=0;
begin
  for item in select * from public.et_scheduled_broadcasts where active and next_run_at<=now() order by next_run_at for update skip locked loop
    insert into public.et_broadcasts(title,message,created_by,scheduled_source_id) values(item.title,item.message,item.created_by,item.id) returning id into broadcast_id;
    insert into public.et_broadcast_recipients(broadcast_id,staff_id)
    select broadcast_id,s.id from public.et_staff s where s.id=any(item.recipient_ids) and s.active and s.role='professional' on conflict do nothing;
    get diagnostics recipient_count=row_count;
    if recipient_count>0 then
      perform net.http_post(url:='https://pwoyucphclluakqabprp.supabase.co/functions/v1/et-send-push',
        body:=jsonb_build_object('broadcastId',broadcast_id,'scheduled',true),
        headers:=jsonb_build_object('Content-Type','application/json'),timeout_milliseconds:=5000);
      processed:=processed+1;
    else
      delete from public.et_broadcasts where id=broadcast_id;
    end if;
    if item.schedule_type='once' then
      update public.et_scheduled_broadcasts set active=false,last_sent_at=case when recipient_count>0 then now() else last_sent_at end where id=item.id;
    else
      update public.et_scheduled_broadcasts set next_run_at=et_private.next_weekly_broadcast_run(item.weekday,item.local_time,now()),last_sent_at=case when recipient_count>0 then now() else last_sent_at end where id=item.id;
    end if;
  end loop;
  return processed;
end $$;
revoke all on function et_private.process_scheduled_broadcasts() from public,anon,authenticated;

select cron.schedule('endoturnos-scheduled-broadcasts','* * * * *','select et_private.process_scheduled_broadcasts();');
