alter table public.et_folder_messages
  add column if not exists read_at timestamptz,
  add column if not exists done_at timestamptz,
  add column if not exists parent_id uuid references public.et_folder_messages(id) on delete set null;

create index if not exists et_folder_messages_parent_idx on public.et_folder_messages(parent_id);
create index if not exists et_folder_messages_sender_created_idx on public.et_folder_messages(sender_id, created_at desc);

alter table public.et_folder_messages
  add constraint et_folder_done_requires_read check (done_at is null or read_at is not null);

revoke update on public.et_folder_messages from authenticated;
grant update (read_at, done_at) on public.et_folder_messages to authenticated;

create policy "folder recipient confirms note"
on public.et_folder_messages for update to authenticated
using (exists (
  select 1 from public.et_staff s
  where s.id = recipient_id and s.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.et_staff s
  where s.id = recipient_id and s.user_id = (select auth.uid())
));

create or replace function public.et_folder_validate_transition()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    if new.parent_id is not null and not exists (
      select 1 from public.et_folder_messages p
      where p.id = new.parent_id and p.sender_id = new.recipient_id
        and p.recipient_id = new.sender_id and p.id <> new.id
    ) then
      raise exception 'La respuesta debe dirigirse al remitente de la nota original';
    end if;
  else
    if new.read_at is distinct from old.read_at then
      if old.read_at is not null or new.read_at is null or new.read_at > now() + interval '1 minute' then
        raise exception 'La confirmación de lectura no puede modificarse';
      end if;
    end if;
    if new.done_at is distinct from old.done_at then
      if old.done_at is not null or new.done_at is null or new.done_at > now() + interval '1 minute' then
        raise exception 'La confirmación de tarea hecha no puede modificarse';
      end if;
    end if;
    if new.read_at is null and new.done_at is not null then
      raise exception 'Confirma la lectura antes de marcar la tarea como hecha';
    end if;
  end if;
  return new;
end $$;

create trigger et_folder_validate_insert before insert on public.et_folder_messages
for each row execute function public.et_folder_validate_transition();
create trigger et_folder_validate_update before update on public.et_folder_messages
for each row execute function public.et_folder_validate_transition();
