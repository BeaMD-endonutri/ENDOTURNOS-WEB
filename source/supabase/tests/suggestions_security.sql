begin;
select set_config('request.jwt.claim.sub',(select user_id::text from public.et_staff where role='supervisor' and active and user_id is not null limit 1),true);
set local role authenticated;
do $$
declare pid uuid; rule jsonb; rows jsonb; snap jsonb; baseline int; published_count int; rejected boolean;
begin
 select id into pid from public.et_staff where active and role='professional' and weekly_minutes>=840 order by id limit 1;
 update public.et_planning_settings set start_date='2030-10-01',end_date='2030-10-31',holidays='{}' where id=1;
 rule:=jsonb_build_object('id','test-rule','weekdays',jsonb_build_array(1),'start_time','08:00','end_time','15:00','min_staff',1,'every_weeks',1,'anchor_date','2030-10-07','monthly',false,'valid_from','2030-10-01','valid_until','2030-10-31','suspensions','[]'::jsonb);
 insert into public.et_consultations(id,label,short_label,color,active,preferred_staff_id,coverage_rules) values('SUGGEST_TEST','Test','TEST','#123456',true,pid,jsonb_build_array(rule));
 insert into public.et_staff_coverage(staff_id,consultation_ids,work_cadences) values(pid,array['SUGGEST_TEST'],jsonb_build_array(rule)) on conflict(staff_id) do update set consultation_ids=excluded.consultation_ids,work_cadences=excluded.work_cadences;
 select count(*) into published_count from public.et_published_assignments;
 snap:=public.et_suggestion_context();
 rows:=jsonb_build_array(jsonb_build_object('professional_id',pid,'consultation_id','SUGGEST_TEST','work_date','2030-10-07','start_time','08:00','end_time','15:00','override_reason','must be ignored'));
 if public.et_apply_suggestion('2030-10-01',snap->>'fingerprint',rows)<>1 then raise exception 'FAIL: valid draft not saved'; end if;
 if not exists(select 1 from public.et_assignments where professional_id=pid and work_date='2030-10-07' and consultation_id='SUGGEST_TEST' and provisional and override_reason is null) then raise exception 'FAIL: provisional/override flags'; end if;
 if (select count(*) from public.et_published_assignments)<>published_count then raise exception 'FAIL: publication changed'; end if;
 rejected:=false;
 begin perform public.et_apply_suggestion('2030-10-01',snap->>'fingerprint',rows); exception when others then if sqlerrm like 'Han cambiado%' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'FAIL: stale proposal accepted'; end if;
 select count(*) into baseline from public.et_assignments;
 snap:=public.et_suggestion_context(); rows:=jsonb_set(rows,'{0,work_date}','"2030-10-14"');
 rejected:=false;
 begin perform public.et_apply_suggestion('2030-10-01',snap->>'fingerprint',rows||rows); exception when others then if sqlerrm like 'Hay un solapamiento%' then rejected:=true; else raise; end if; end;
 if not rejected or (select count(*) from public.et_assignments)<>baseline then raise exception 'FAIL: partial save or duplicate accepted'; end if;
 rejected:=false;
 begin update public.et_consultations set preferred_staff_id=null where id='SUGGEST_TEST'; exception when others then if sqlerrm like 'Selecciona un profesional preferente%' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'FAIL: missing primary accepted'; end if;
 rejected:=false;
 begin update public.et_consultations set secondary_staff_ids=array[pid] where id='SUGGEST_TEST'; exception when others then if sqlerrm like 'Revisa los profesionales secundarios%' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'FAIL: duplicate primary accepted'; end if;
 update public.et_staff_coverage set work_cadences='[]' where staff_id=pid;
 snap:=public.et_suggestion_context(); rejected:=false;
 begin perform public.et_apply_suggestion('2030-10-01',snap->>'fingerprint',rows); exception when others then if sqlerrm like 'El turno no respeta las consultas o cadencias%' then rejected:=true; else raise; end if; end;
 if not rejected then raise exception 'FAIL: missing cadence accepted'; end if;
end; $$;
reset role;
select set_config('request.jwt.claim.sub',(select user_id::text from public.et_staff where role='professional' and active and user_id is not null limit 1),true);
set local role authenticated;
do $$
declare denied int:=0;
begin
 begin perform public.et_suggestion_context(); exception when others then if sqlerrm like 'Solo supervisión%' then denied:=denied+1; else raise; end if; end;
 begin perform public.et_apply_suggestion('2030-10-01','invalid','[]'); exception when others then if sqlerrm like 'Solo supervisión%' then denied:=denied+1; else raise; end if; end;
 if denied<>2 then raise exception 'FAIL: professional could generate/save proposals'; end if;
end; $$;
rollback;
select 'Suggestion security tests passed; all test data rolled back' as result;
