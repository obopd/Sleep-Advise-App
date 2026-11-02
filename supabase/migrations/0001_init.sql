-- Sleep Advisor: initial schema (mirrors src/core/schema.js; a test checks they match).
-- Run once in Supabase → SQL Editor, or with `supabase db push`. Safe to re-run.
--
-- Access model (Row Level Security everywhere):
--   * Every observation, feature and prediction row belongs to one auth user; only that
--     user can read or change it.
--   * Predictions are append-only: no UPDATE policy exists.
--   * Research data uses a pseudonymous participant_id. Laboratory measurements are
--     readable by the participant (through their own enrolment row) and by approved
--     researchers; only researchers (or the participant for their own self-reported
--     result) can add them.
--   * The browser only ever holds the public anon key. No service-role key is needed.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Users (profile kept separate from longitudinal observations)
create table if not exists public.user_profiles (
  id                   uuid primary key references auth.users (id) on delete cascade default auth.uid(),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  timezone             text not null,
  profile_preferences  jsonb not null default '{}'::jsonb,  -- birthday, schedule, chronotype answers, tracking choices
  consent              jsonb not null default '{}'::jsonb   -- per-category consent with timestamps
);

-- Shared columns for observation tables are written out in each table on purpose:
-- every table is readable on its own in the SQL editor.

create table if not exists public.sleep_episodes (
  id                              uuid primary key default gen_random_uuid(),
  user_id                         uuid not null references auth.users (id) on delete cascade default auth.uid(),
  episode_type                    text not null check (episode_type in ('main','nap','other')),
  start_time                      timestamptz not null,
  attempt_time                    timestamptz,
  onset_time                      timestamptz,
  final_awakening_time            timestamptz,
  end_time                        timestamptz,
  sleep_latency_minutes           numeric check (sleep_latency_minutes between 0 and 720),
  wake_after_sleep_onset_minutes  numeric check (wake_after_sleep_onset_minutes between 0 and 1440),
  awakenings_count                integer check (awakenings_count between 0 and 100),
  subjective_quality              integer check (subjective_quality between 1 and 5),
  morning_refreshment             integer check (morning_refreshment between 1 and 5),
  quality_flags                   jsonb,
  source                          text not null,
  tz                              text not null,
  created_at                      timestamptz not null default now(),
  updated_at                      timestamptz not null default now(),
  revisions                       jsonb,
  constraint sleep_end_after_start check (end_time is null or end_time > start_time),
  constraint sleep_order check (
    (attempt_time is null or attempt_time >= start_time) and
    (onset_time is null or onset_time >= coalesce(attempt_time, start_time)) and
    (final_awakening_time is null or final_awakening_time >= coalesce(onset_time, attempt_time, start_time)) and
    (end_time is null or final_awakening_time is null or end_time >= final_awakening_time))
);
create index if not exists sleep_episodes_user_start on public.sleep_episodes (user_id, start_time);

create table if not exists public.light_exposure_events (
  id                        uuid primary key default gen_random_uuid(),
  user_id                   uuid not null references auth.users (id) on delete cascade default auth.uid(),
  start_time                timestamptz not null,
  end_time                  timestamptz not null,
  measurement_type          text not null check (measurement_type in ('self_report','sensor')),
  illuminance_lux           numeric check (illuminance_lux between 0 and 200000),
  spectral_measurement      jsonb,
  melanopic_edi_lux         numeric check (melanopic_edi_lux between 0 and 200000),
  sensor_source             text,
  sensor_position           text check (sensor_position in ('wrist','chest','eye_level','phone','desk','unknown')),
  indoor_outdoor_context    text check (indoor_outdoor_context in ('outdoor','indoor','mixed','unknown')),
  self_reported_brightness  text check (self_reported_brightness in ('dim','normal_indoor','bright_indoor','daylight')),
  measurement_quality       jsonb,
  source                    text not null,
  tz                        text not null,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),
  revisions                 jsonb,
  constraint light_end_after_start check (end_time >= start_time),
  -- lux, melanopic and spectral values only from sensors; never derived from self-report
  constraint light_values_only_from_sensor check (measurement_type = 'sensor' or (illuminance_lux is null and melanopic_edi_lux is null and spectral_measurement is null))
);
create index if not exists light_user_start on public.light_exposure_events (user_id, start_time);

create table if not exists public.meal_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade default auth.uid(),
  start_time        timestamptz not null,
  end_time          timestamptz,
  meal_category     text not null check (meal_category in ('breakfast','lunch','dinner','snack','other')),
  approximate_size  text check (approximate_size in ('small','medium','large')),
  calories_kcal     numeric check (calories_kcal between 0 and 10000),
  macronutrients    jsonb,
  source            text not null,
  tz                text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revisions         jsonb,
  constraint meal_end_after_start check (end_time is null or end_time >= start_time)
);
create index if not exists meal_user_start on public.meal_events (user_id, start_time);

create table if not exists public.substance_events (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade default auth.uid(),
  event_type  text not null check (event_type in ('caffeine','alcohol')),
  start_time  timestamptz not null,
  amount      numeric not null check (amount between 0 and 5000),
  unit        text not null check (unit in ('mg','standard_drink','ml','serving')),
  product     text,
  source      text not null,
  tz          text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  revisions   jsonb
);
create index if not exists substance_user_start on public.substance_events (user_id, event_type, start_time);

create table if not exists public.subjective_observations (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users (id) on delete cascade default auth.uid(),
  "timestamp"       timestamptz not null,
  measure           text not null check (measure in ('stress','energy','sleepiness')),
  rating            integer not null check (rating between 1 and 9),
  scale_definition  text not null,
  optional_context  text,
  source            text not null,
  tz                text not null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  revisions         jsonb
);
create index if not exists subjective_user_time on public.subjective_observations (user_id, measure, "timestamp");

create table if not exists public.activity_events (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  start_time     timestamptz not null,
  end_time       timestamptz not null,
  activity_type  text not null,
  intensity      text check (intensity in ('light','moderate','vigorous','unknown')),
  source         text not null,
  tz             text not null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  revisions      jsonb,
  constraint activity_end_after_start check (end_time >= start_time)
);
create index if not exists activity_user_start on public.activity_events (user_id, start_time);

-- Sensitive: only written when the user enables medication tracking.
create table if not exists public.medication_events (
  id                     uuid primary key default gen_random_uuid(),
  user_id                uuid not null references auth.users (id) on delete cascade default auth.uid(),
  medication_identifier  text not null,
  kind                   text check (kind in ('medication','supplement')),
  dose                   numeric check (dose >= 0),
  unit                   text,
  "timestamp"            timestamptz not null,
  status                 text check (status in ('current','historical')),
  source                 text not null,
  tz                     text not null,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  revisions              jsonb
);
create index if not exists medication_user_time on public.medication_events (user_id, "timestamp");

create table if not exists public.daily_features (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references auth.users (id) on delete cascade default auth.uid(),
  feature_window_start  timestamptz not null,
  feature_window_end    timestamptz not null,
  feature_name          text not null,
  feature_value         numeric,            -- null = unavailable, never 0 for missing
  feature_unit          text,
  data_coverage         numeric check (data_coverage between 0 and 1),
  feature_version       text not null,
  generated_at          timestamptz not null default now(),
  constraint feature_window check (feature_window_end >= feature_window_start)
);
create index if not exists features_user_name_end on public.daily_features (user_id, feature_name, feature_window_end);

create table if not exists public.model_predictions (
  id                             uuid primary key default gen_random_uuid(),
  user_id                        uuid not null references auth.users (id) on delete cascade default auth.uid(),
  prediction_timestamp           timestamptz not null,
  target_variable                text not null,
  predicted_value                numeric,     -- null when no prediction could be made
  predicted_unit                 text,
  prediction_interval_lower      numeric,
  prediction_interval_upper      numeric,
  confidence_or_quality_status   text not null check (confidence_or_quality_status in ('ok','insufficient_data','unsupported_population','missing_required_features','invalid_input')),
  model_name                     text not null,
  model_version                  text not null,
  input_data_window              jsonb not null,
  input_data_coverage            numeric check (input_data_coverage between 0 and 1),
  validation_status              text not null check (validation_status in ('experimental_unvalidated','validated_external','validated_internal')),
  generated_at                   timestamptz not null default now(),
  constraint interval_both_or_none check ((prediction_interval_lower is null) = (prediction_interval_upper is null)),
  constraint interval_ordered check (prediction_interval_lower is null or prediction_interval_lower <= prediction_interval_upper),
  constraint value_iff_ok check ((confidence_or_quality_status = 'ok') = (predicted_value is not null))
);
create index if not exists predictions_user_target on public.model_predictions (user_id, target_variable, prediction_timestamp);

-- ---------------------------------------------------------------------------
-- Research: pseudonymous participants, approved researchers, reference measurements.
create table if not exists public.app_researchers (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  approved_at timestamptz not null default now()
);

create table if not exists public.research_participants (
  participant_id   text primary key,
  user_id          uuid unique references auth.users (id) on delete set null default auth.uid(),
  consent_version  text not null,
  consented_at     timestamptz not null default now(),
  withdrawn_at     timestamptz
);

create table if not exists public.laboratory_measurements (
  id                      uuid primary key default gen_random_uuid(),
  participant_id          text not null references public.research_participants (participant_id) on delete cascade,
  collection_timestamp    timestamptz not null,
  tz                      text not null,
  analyte                 text not null check (analyte in ('melatonin','cortisol','dlmo')),
  measured_value          numeric not null,
  measured_unit           text not null check (measured_unit in ('pg/mL','nmol/L','ug/dL','clock_minutes')),
  sample_type             text not null check (sample_type in ('saliva','plasma','serum','urine','derived')),
  assay_method            text,
  laboratory_identifier   text,
  quality_control_status  text check (quality_control_status in ('passed','failed','pending','not_reported')),
  protocol_deviation      text,
  source                  text not null,
  created_at              timestamptz not null default now()
);
create index if not exists lab_participant_time on public.laboratory_measurements (participant_id, analyte, collection_timestamp);

create or replace function public.is_researcher() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.app_researchers where user_id = auth.uid())
$$;

create or replace function public.my_participant_ids() returns setof text
language sql stable security definer set search_path = public as $$
  select participant_id from public.research_participants where user_id = auth.uid()
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
do $$
declare t text;
begin
  foreach t in array array['sleep_episodes','light_exposure_events','meal_events','substance_events',
                           'subjective_observations','activity_events','medication_events','daily_features'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "own rows" on public.%I', t);
    execute format('create policy "own rows" on public.%I for all using (auth.uid() = user_id) with check (auth.uid() = user_id)', t);
  end loop;
end $$;

alter table public.user_profiles enable row level security;
drop policy if exists "own profile" on public.user_profiles;
create policy "own profile" on public.user_profiles for all using (auth.uid() = id) with check (auth.uid() = id);

-- Predictions: read, add and delete your own; never update (history is kept).
alter table public.model_predictions enable row level security;
drop policy if exists "own predictions: select" on public.model_predictions;
drop policy if exists "own predictions: insert" on public.model_predictions;
drop policy if exists "own predictions: delete" on public.model_predictions;
create policy "own predictions: select" on public.model_predictions for select using (auth.uid() = user_id);
create policy "own predictions: insert" on public.model_predictions for insert with check (auth.uid() = user_id);
create policy "own predictions: delete" on public.model_predictions for delete using (auth.uid() = user_id);

alter table public.app_researchers enable row level security;
drop policy if exists "researchers see themselves" on public.app_researchers;
create policy "researchers see themselves" on public.app_researchers for select using (auth.uid() = user_id);
-- No insert/update/delete policy: researchers are approved by the project owner in the SQL editor.

alter table public.research_participants enable row level security;
drop policy if exists "participant: own row" on public.research_participants;
drop policy if exists "participant: enrol" on public.research_participants;
drop policy if exists "participant: withdraw" on public.research_participants;
drop policy if exists "researchers: read participants" on public.research_participants;
create policy "participant: own row" on public.research_participants for select using (auth.uid() = user_id);
create policy "participant: enrol" on public.research_participants for insert with check (auth.uid() = user_id);
create policy "participant: withdraw" on public.research_participants for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "researchers: read participants" on public.research_participants for select using (public.is_researcher());

alter table public.laboratory_measurements enable row level security;
drop policy if exists "lab: participant reads own" on public.laboratory_measurements;
drop policy if exists "lab: participant adds own self-reported" on public.laboratory_measurements;
drop policy if exists "lab: researchers read" on public.laboratory_measurements;
drop policy if exists "lab: researchers write" on public.laboratory_measurements;
create policy "lab: participant reads own" on public.laboratory_measurements for select using (participant_id in (select public.my_participant_ids()));
create policy "lab: participant adds own self-reported" on public.laboratory_measurements for insert
  with check (participant_id in (select public.my_participant_ids()) and source in ('user','migration_v1'));
create policy "lab: researchers read" on public.laboratory_measurements for select using (public.is_researcher());
create policy "lab: researchers write" on public.laboratory_measurements for all using (public.is_researcher()) with check (public.is_researcher());

-- ---------------------------------------------------------------------------
-- Account deletion: removes the auth user, which cascades to every owned row.
-- Research enrolment rows are deleted together with their laboratory measurements
-- (data deletion is honoured for research data too; see docs/PRIVACY.md).
create or replace function public.delete_my_account() returns void
language plpgsql security definer set search_path = public as $$
declare uid uuid := auth.uid();
begin
  if uid is null then raise exception 'not signed in'; end if;
  delete from public.research_participants where user_id = uid;
  delete from auth.users where id = uid;
end $$;
revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
