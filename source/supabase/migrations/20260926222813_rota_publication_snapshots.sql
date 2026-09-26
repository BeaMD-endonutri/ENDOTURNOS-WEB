-- Existing assignments remain the supervisor's working draft.
create table public.et_published_assignments (like public.et_assignments including defaults including constraints);
alter table public.et_published_assignments add primary key (id);
create index on public.et_published_assignments(work_date);
create table public.et_rota_publications (
 month date primary key check (extract(day from month)=1),
 published_at timestamptz not null default now(),
 published_by uuid,
 version integer not null default 1,
 initial_snapshot boolean not null default false
);
alter table public.et_published_assignments enable row level security;
alter table public.et_rota_publications enable row level security;
grant select,insert,update,delete on public.et_published_assignments,public.et_rota_publications to authenticated;
create policy "team reads published rota" on public.et_published_assignments for select to authenticated using ((select et_private.current_staff_id()) is not null);
create policy "supervisor manages published rota" on public.et_published_assignments for all to authenticated using ((select et_private.is_supervisor())) with check ((select et_private.is_supervisor()));
create policy "team reads publication dates" on public.et_rota_publications for select to authenticated using ((select et_private.current_staff_id()) is not null);
create policy "supervisor manages publication dates" on public.et_rota_publications for all to authenticated using ((select et_private.is_supervisor())) with check ((select et_private.is_supervisor()));
insert into public.et_published_assignments select * from public.et_assignments;
insert into public.et_rota_publications(month,initial_snapshot) select distinct date_trunc('month',work_date)::date,true from public.et_assignments;
-- Only supervision can read working copies, including through the Data API.
-- Access restriction is activated after the compatible web release is available.

create function public.et_preview_publication(p_month date) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m date:=date_trunc('month',p_month)::date; result jsonb; fingerprint text; blocked integer;
begin
 if auth.uid() is null or not et_private.is_supervisor() then raise exception 'Solo supervisión puede publicar el cuadrante'; end if;
 if m is null then raise exception 'Selecciona un mes'; end if;
 select md5(coalesce(jsonb_agg(to_jsonb(a) order by id)::text,'[]')) into fingerprint from public.et_assignments a where work_date>=m and work_date<(m+interval '1 month');
 select count(*) into blocked from public.et_assignments a where a.work_date>=m and a.work_date<(m+interval '1 month') and nullif(trim(a.override_reason),'') is null and (
 exists(select 1 from public.et_assignments b where b.id<>a.id and b.professional_id=a.professional_id and b.work_date=a.work_date and b.start_time<a.end_time and b.end_time>a.start_time)
 or exists(select 1 from public.et_requests r where r.professional_id=a.professional_id and r.status='approved' and r.request_type in ('vacation','permission') and a.work_date between r.date_from and r.date_to));
 with d as (select id,to_jsonb(a)-array['updated_at','updated_by','created_at','created_by'] as data from public.et_assignments a where work_date>=m and work_date<(m+interval '1 month')),
 p as (select id,to_jsonb(a)-array['updated_at','updated_by','created_at','created_by'] as data from public.et_published_assignments a where work_date>=m and work_date<(m+interval '1 month'))
 select jsonb_build_object('added',count(*) filter(where p.id is null),'removed',count(*) filter(where d.id is null),'changed',count(*) filter(where p.id is not null and d.id is not null and p.data is distinct from d.data)) into result from d full join p using(id);
 return result || jsonb_build_object('fingerprint',fingerprint,'blocked',blocked,'exceptions',(select count(*) from public.et_assignments where work_date>=m and work_date<(m+interval '1 month') and nullif(trim(override_reason),'') is not null),'provisional',(select count(*) from public.et_assignments where work_date>=m and work_date<(m+interval '1 month') and provisional));
end $$;

create function public.et_publish_rota(p_month date,p_fingerprint text) returns jsonb language plpgsql security invoker set search_path='' as $$
declare m date:=date_trunc('month',p_month)::date; preview jsonb; notice uuid; v integer; stamp timestamptz:=now();
begin
 if auth.uid() is null or not et_private.is_supervisor() then raise exception 'Solo supervisión puede publicar el cuadrante'; end if;
 lock table public.et_assignments in share row exclusive mode;
 lock table public.et_requests in share mode;
 preview:=public.et_preview_publication(m);
 if preview->>'fingerprint' is distinct from p_fingerprint then raise exception 'El borrador ha cambiado. Cierra la revisión y vuelve a abrirla antes de publicar.'; end if;
 if (preview->>'blocked')::int>0 then raise exception 'Resuelve los conflictos sin justificar antes de publicar'; end if;
 if (preview->>'added')::int+(preview->>'changed')::int+(preview->>'removed')::int=0 then raise exception 'No hay cambios pendientes de publicar'; end if;
 delete from public.et_published_assignments where work_date>=m and work_date<(m+interval '1 month');
 insert into public.et_published_assignments select * from public.et_assignments where work_date>=m and work_date<(m+interval '1 month');
 insert into public.et_rota_publications(month,published_at,published_by,version,initial_snapshot) values(m,stamp,auth.uid(),1,false)
 on conflict(month) do update set published_at=excluded.published_at,published_by=excluded.published_by,version=et_rota_publications.version+1,initial_snapshot=false returning version into v;
 notice:=public.et_create_broadcast('Cuadrante publicado', 'Ya está disponible el cuadrante de '||to_char(m,'MM/YYYY')||'. Consulta la nueva versión en Cuadrante.', array(select id from public.et_staff where active and role='professional'));
 return jsonb_build_object('broadcast_id',notice,'published_at',stamp,'version',v);
end $$;
revoke all on function public.et_preview_publication(date),public.et_publish_rota(date,text) from public,anon;
grant execute on function public.et_preview_publication(date),public.et_publish_rota(date,text) to authenticated;
alter publication supabase_realtime add table public.et_published_assignments, public.et_rota_publications;
