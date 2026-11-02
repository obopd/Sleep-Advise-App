-- Access-control checks. Each block raises an exception on failure; psql stops at the first one.
\set ON_ERROR_STOP 1
\set A '00000000-0000-0000-0000-00000000000a'
\set B '00000000-0000-0000-0000-00000000000b'
\set R '00000000-0000-0000-0000-00000000000c'

insert into public.app_researchers (user_id) values (:'R');

-- Alice adds sleep, a prediction and enrols in research.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
insert into public.sleep_episodes (episode_type, start_time, end_time, source, tz) values ('main','2026-10-01T03:00Z','2026-10-01T11:00Z','user','America/New_York');
insert into public.model_predictions (prediction_timestamp, target_variable, predicted_value, predicted_unit, confidence_or_quality_status, model_name, model_version, input_data_window, validation_status)
  values ('2026-10-01T12:00Z','sleep_pressure_proxy',0.4,'fraction','ok','process_s','1.0.0','{}','experimental_unvalidated');
insert into public.research_participants (participant_id, consent_version) values ('P-ALICE001','2026-11');
insert into public.laboratory_measurements (participant_id, collection_timestamp, tz, analyte, measured_value, measured_unit, sample_type, source)
  values ('P-ALICE001','2026-10-05T01:30Z','America/New_York','dlmo',1290,'clock_minutes','derived','user');
commit;

-- Bob cannot see or change Alice's records.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000b"}';
do $$ begin
  if (select count(*) from public.sleep_episodes) <> 0 then raise exception 'FAIL: Bob sees Alice''s sleep'; end if;
  if (select count(*) from public.model_predictions) <> 0 then raise exception 'FAIL: Bob sees Alice''s predictions'; end if;
  if (select count(*) from public.laboratory_measurements) <> 0 then raise exception 'FAIL: Bob sees lab data'; end if;
  if (select count(*) from public.research_participants) <> 0 then raise exception 'FAIL: Bob sees research enrolment'; end if;
  update public.sleep_episodes set tz = 'UTC';
  if found then raise exception 'FAIL: Bob updated Alice''s sleep'; end if;
  delete from public.sleep_episodes;
  if found then raise exception 'FAIL: Bob deleted Alice''s sleep'; end if;
end $$;
-- Bob cannot write a row owned by Alice.
do $$ begin
  begin
    insert into public.sleep_episodes (user_id, episode_type, start_time, source, tz) values ('00000000-0000-0000-0000-00000000000a','main',now(),'user','UTC');
    raise exception 'FAIL: Bob inserted a row for Alice';
  exception when insufficient_privilege then null; end;
  -- Bob cannot add lab data to Alice's participant ID, nor make himself a researcher.
  begin
    insert into public.laboratory_measurements (participant_id, collection_timestamp, tz, analyte, measured_value, measured_unit, sample_type, source)
      values ('P-ALICE001', now(), 'UTC', 'melatonin', 5, 'pg/mL', 'saliva', 'laboratory');
    raise exception 'FAIL: Bob added lab data for Alice';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.app_researchers (user_id) values ('00000000-0000-0000-0000-00000000000b');
    raise exception 'FAIL: Bob made himself a researcher';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- Unauthenticated (anon) sees nothing.
begin;
set local role anon;
set local request.jwt.claims = '';
do $$ begin
  if (select count(*) from public.sleep_episodes) + (select count(*) from public.laboratory_measurements) <> 0 then raise exception 'FAIL: anon sees data'; end if;
end $$;
commit;

-- Alice: predictions are append-only; she cannot add a lab result as "laboratory".
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$ begin
  update public.model_predictions set predicted_value = 0.9;
  if found then raise exception 'FAIL: prediction was updated'; end if;
  if (select count(*) from public.laboratory_measurements) <> 1 then raise exception 'FAIL: Alice cannot read her own lab result'; end if;
  begin
    insert into public.laboratory_measurements (participant_id, collection_timestamp, tz, analyte, measured_value, measured_unit, sample_type, source)
      values ('P-ALICE001', now(), 'UTC', 'melatonin', 5, 'pg/mL', 'saliva', 'laboratory');
    raise exception 'FAIL: participant added a "laboratory" record';
  exception when insufficient_privilege then null; end;
end $$;
commit;

-- Constraints: impossible order, lux without sensor, fabricated interval, value without ok status.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
do $$ begin
  begin insert into public.sleep_episodes (episode_type, start_time, onset_time, end_time, source, tz) values ('main','2026-10-02T03:00Z','2026-10-02T02:00Z','2026-10-02T10:00Z','user','UTC');
    raise exception 'FAIL: onset before bed accepted'; exception when check_violation then null; end;
  begin insert into public.light_exposure_events (start_time, end_time, measurement_type, illuminance_lux, source, tz) values (now(), now(), 'self_report', 5000, 'user', 'UTC');
    raise exception 'FAIL: lux on self-report accepted'; exception when check_violation then null; end;
  begin insert into public.model_predictions (prediction_timestamp, target_variable, predicted_value, prediction_interval_lower, confidence_or_quality_status, model_name, model_version, input_data_window, validation_status)
      values (now(),'x',1,0,'ok','m','1','{}','experimental_unvalidated');
    raise exception 'FAIL: half interval accepted'; exception when check_violation then null; end;
  begin insert into public.model_predictions (prediction_timestamp, target_variable, predicted_value, confidence_or_quality_status, model_name, model_version, input_data_window, validation_status)
      values (now(),'x',0,'insufficient_data','m','1','{}','experimental_unvalidated');
    raise exception 'FAIL: value with insufficient_data accepted'; exception when check_violation then null; end;
end $$;
commit;

-- Researcher reads lab data and enrolments but not Alice's sleep diary.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000c"}';
do $$ begin
  if (select count(*) from public.laboratory_measurements) <> 1 then raise exception 'FAIL: researcher cannot read lab data'; end if;
  if (select count(*) from public.research_participants) <> 1 then raise exception 'FAIL: researcher cannot read enrolments'; end if;
  if (select count(*) from public.sleep_episodes) <> 0 then raise exception 'FAIL: researcher sees private sleep diary'; end if;
end $$;
commit;

-- Account deletion removes everything Alice owns, including research rows.
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-00000000000a"}';
select public.delete_my_account();
commit;
do $$ begin
  if exists (select 1 from auth.users where id = '00000000-0000-0000-0000-00000000000a') then raise exception 'FAIL: user not deleted'; end if;
  if (select count(*) from public.sleep_episodes) + (select count(*) from public.model_predictions)
     + (select count(*) from public.laboratory_measurements) + (select count(*) from public.research_participants) <> 0 then
    raise exception 'FAIL: data left after account deletion';
  end if;
end $$;

-- Anonymous callers cannot delete accounts.
begin;
set local role anon;
do $$ begin
  begin perform public.delete_my_account(); raise exception 'FAIL: anon could call delete_my_account';
  exception when insufficient_privilege then null; end;
end $$;
commit;

\echo 'RLS checks passed'
