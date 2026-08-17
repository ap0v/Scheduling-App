-- Calendar and scheduling schema: personal-calendar MVP.
--
-- This migration targets Supabase Postgres. auth.users is Supabase-managed and
-- is intentionally not created here. Deferred shared-calendar, booking, and
-- external-calendar-sync tables are intentionally excluded.

begin;

-- Validate the named zones persisted by the application without accepting
-- fixed UTC offsets. PostgreSQL's zone catalog includes IANA identifiers such
-- as America/New_York and Etc/UTC.
create or replace function public.is_valid_time_zone(candidate text)
returns boolean
language sql
stable
set search_path = pg_catalog
as $$
  select candidate is not null
    and candidate = btrim(candidate)
    and exists (
      select 1
      from pg_catalog.pg_timezone_names as zone_name
      where zone_name.name = candidate
    );
$$;

-- Authentication metadata is user-provided and must never make signup fail.
-- Persist a supplied zone only when PostgreSQL recognizes it; otherwise use
-- the product default.
create or replace function public.valid_time_zone_or_utc(candidate text)
returns varchar(64)
language sql
stable
set search_path = pg_catalog
as $$
  select case
    when public.is_valid_time_zone(left(btrim(candidate), 64))
      then left(btrim(candidate), 64)::varchar(64)
    else 'Etc/UTC'::varchar(64)
  end;
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Clients must submit the next version they observed. Row locking during an
-- UPDATE makes this an optimistic-concurrency check: a second stale update
-- cannot advance the same version twice.
create or replace function public.require_next_event_row_version()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if new.row_version <> old.row_version + 1 then
    raise exception using
      errcode = '40001',
      message = 'event row_version must advance by exactly one';
  end if;

  return new;
end;
$$;

-- Application-facing record for the Supabase Auth user.
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name varchar(120) not null,
  time_zone varchar(64) not null default 'Etc/UTC',
  locale varchar(16),
  deletion_requested_at timestamptz,
  purge_after timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint profiles_email_normalized_check check (
    email is null or (email = lower(btrim(email)) and btrim(email) <> '')
  ),
  constraint profiles_display_name_not_blank_check check (btrim(display_name) <> ''),
  constraint profiles_time_zone_valid_check check (public.is_valid_time_zone(time_zone))
);

create unique index profiles_active_email_lower_key
  on public.profiles (lower(email))
  where email is not null and deleted_at is null;

-- Keep sign-up logic deliberately small: create an active profile with safe
-- defaults even when an identity provider supplies no profile metadata.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email,
    display_name,
    time_zone,
    locale
  )
  values (
    new.id,
    lower(nullif(btrim(new.email), '')),
    coalesce(
      nullif(left(btrim(new.raw_user_meta_data ->> 'display_name'), 120), ''),
      nullif(left(btrim(new.raw_user_meta_data ->> 'full_name'), 120), ''),
      nullif(left(split_part(coalesce(new.email, ''), '@', 1), 120), ''),
      'New user'
    ),
    public.valid_time_zone_or_utc(new.raw_user_meta_data ->> 'time_zone'),
    nullif(left(btrim(new.raw_user_meta_data ->> 'locale'), 16), '')
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- auth.users remains the credential and contact-email source of truth. Keep
-- the queryable profile snapshot synchronized whenever Auth changes it.
create or replace function public.handle_auth_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = lower(nullif(btrim(new.email), ''))
  where id = new.id;

  return new;
end;
$$;

create trigger on_auth_user_email_updated
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_auth_user_email_change();

-- Backfill accounts that existed before this migration, if any.
insert into public.profiles (
  id,
  email,
  display_name,
  time_zone,
  locale
)
select
  user_record.id,
  lower(nullif(btrim(user_record.email), '')),
  coalesce(
    nullif(left(btrim(user_record.raw_user_meta_data ->> 'display_name'), 120), ''),
    nullif(left(btrim(user_record.raw_user_meta_data ->> 'full_name'), 120), ''),
    nullif(left(split_part(coalesce(user_record.email, ''), '@', 1), 120), ''),
    'New user'
  ),
  public.valid_time_zone_or_utc(user_record.raw_user_meta_data ->> 'time_zone'),
  nullif(left(btrim(user_record.raw_user_meta_data ->> 'locale'), 16), '')
from auth.users as user_record
on conflict (id) do nothing;

create table public.calendars (
  id uuid primary key default gen_random_uuid(),
  owner_profile_id uuid not null references public.profiles (id) on delete cascade,
  name varchar(160) not null,
  description text,
  color varchar(9),
  time_zone varchar(64) not null default 'Etc/UTC',
  default_event_access varchar(20) not null default 'private',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint calendars_name_not_blank_check check (btrim(name) <> ''),
  constraint calendars_time_zone_valid_check check (public.is_valid_time_zone(time_zone)),
  constraint calendars_default_event_access_check check (
    default_event_access in ('private', 'invitees')
  )
);

create index calendars_owner_profile_active_idx
  on public.calendars (owner_profile_id)
  where deleted_at is null;

-- A row is either timed or all-day. All-day end dates are exclusive.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.calendars (id) on delete cascade,
  created_by_profile_id uuid not null references public.profiles (id),
  title varchar(500) not null,
  description text,
  location varchar(500),
  conference_url text,
  status varchar(20) not null default 'confirmed',
  busy_status varchar(20) not null default 'busy',
  access_scope varchar(20) not null default 'private',
  is_all_day boolean not null default false,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  event_time_zone varchar(64),
  recurrence_rule text,
  recurrence_revision integer not null default 0,
  sequence integer not null default 0,
  row_version integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint events_title_not_blank_check check (btrim(title) <> ''),
  constraint events_temporal_shape_check check (
    (
      is_all_day = false
      and starts_at is not null
      and ends_at is not null
      and starts_on is null
      and ends_on is null
      and ends_at > starts_at
    )
    or
    (
      is_all_day = true
      and starts_on is not null
      and ends_on is not null
      and starts_at is null
      and ends_at is null
      and ends_on > starts_on
    )
  ),
  constraint events_timed_requires_time_zone_check check (
    is_all_day or event_time_zone is not null
  ),
  constraint events_time_zone_valid_check check (
    event_time_zone is null or public.is_valid_time_zone(event_time_zone)
  ),
  constraint events_status_check check (status in ('confirmed', 'cancelled')),
  constraint events_busy_status_check check (
    busy_status in ('busy', 'free', 'out_of_office')
  ),
  constraint events_access_scope_check check (access_scope in ('private', 'invitees')),
  constraint events_recurrence_revision_nonnegative_check check (recurrence_revision >= 0),
  constraint events_sequence_nonnegative_check check (sequence >= 0),
  constraint events_row_version_nonnegative_check check (row_version >= 0)
);

create index events_active_timed_calendar_starts_at_idx
  on public.events (calendar_id, starts_at)
  where deleted_at is null and is_all_day = false;

create index events_active_all_day_calendar_starts_on_idx
  on public.events (calendar_id, starts_on)
  where deleted_at is null and is_all_day = true;

-- A sparse override changes or cancels one occurrence of a recurring master.
-- Recurrence-rule and occurrence-membership validation belongs in the service.
create table public.event_occurrence_overrides (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  original_starts_at timestamptz,
  original_starts_on date,
  is_cancelled boolean not null default false,
  title varchar(500),
  description text,
  location varchar(500),
  conference_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  starts_on date,
  ends_on date,
  event_time_zone varchar(64),
  updated_by_profile_id uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_occurrence_overrides_original_key_check check (
    (original_starts_at is not null and original_starts_on is null)
    or
    (original_starts_at is null and original_starts_on is not null)
  ),
  constraint event_occurrence_overrides_replacement_shape_check check (
    (
      starts_at is null
      and ends_at is null
      and starts_on is null
      and ends_on is null
    )
    or
    (
      starts_at is not null
      and ends_at is not null
      and starts_on is null
      and ends_on is null
      and ends_at > starts_at
    )
    or
    (
      starts_on is not null
      and ends_on is not null
      and starts_at is null
      and ends_at is null
      and ends_on > starts_on
    )
  ),
  constraint event_occurrence_overrides_time_zone_valid_check check (
    event_time_zone is null or public.is_valid_time_zone(event_time_zone)
  ),
  constraint event_occurrence_overrides_event_original_starts_at_key unique (
    event_id,
    original_starts_at
  ),
  constraint event_occurrence_overrides_event_original_starts_on_key unique (
    event_id,
    original_starts_on
  )
);

create table public.event_attendees (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  profile_id uuid references public.profiles (id) on delete set null,
  email text,
  display_name varchar(160),
  role varchar(20) not null default 'required',
  response_status varchar(20) not null default 'needs_action',
  responded_at timestamptz,
  invited_at timestamptz not null default now(),
  constraint event_attendees_identity_check check (profile_id is not null or email is not null),
  constraint event_attendees_email_normalized_check check (
    email is null or (email = lower(btrim(email)) and btrim(email) <> '')
  ),
  constraint event_attendees_role_check check (
    role in ('organizer', 'required', 'optional', 'resource')
  ),
  constraint event_attendees_response_status_check check (
    response_status in ('needs_action', 'accepted', 'declined', 'tentative')
  )
);

create index event_attendees_event_id_idx on public.event_attendees (event_id);

create unique index event_attendees_event_profile_key
  on public.event_attendees (event_id, profile_id)
  where profile_id is not null;

create unique index event_attendees_event_email_lower_key
  on public.event_attendees (event_id, lower(email))
  where profile_id is null and email is not null;

-- Every event begins with its creator as an organizer. Additional attendees
-- remain managed by the event-owner policy below.
create or replace function public.add_event_creator_as_organizer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.event_attendees (
    event_id,
    profile_id,
    role,
    response_status
  )
  values (
    new.id,
    new.created_by_profile_id,
    'organizer',
    'accepted'
  );

  return new;
end;
$$;

create trigger events_add_creator_as_organizer
  after insert on public.events
  for each row execute function public.add_event_creator_as_organizer();

-- Tokens are stored only as one-way digests; raw guest-link tokens never enter
-- the database.
create table public.event_invitations (
  id uuid primary key default gen_random_uuid(),
  event_attendee_id uuid not null references public.event_attendees (id) on delete cascade,
  token_digest text not null,
  scope varchar(20) not null default 'event_details',
  expires_at timestamptz,
  revoked_at timestamptz,
  last_viewed_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  constraint event_invitations_token_digest_not_blank_check check (btrim(token_digest) <> ''),
  constraint event_invitations_token_digest_key unique (token_digest),
  constraint event_invitations_scope_check check (scope = 'event_details')
);

create index event_invitations_active_token_digest_idx
  on public.event_invitations (token_digest)
  where revoked_at is null;

-- One host-confirmed location per event. Provider-owned place content is not
-- persisted; only a Google Place ID may be retained.
create table public.event_locations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  kind varchar(20) not null,
  host_label varchar(500),
  host_address text,
  google_place_id text,
  place_id_refreshed_at timestamptz,
  host_confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint event_locations_event_id_key unique (event_id),
  constraint event_locations_kind_check check (kind in ('manual', 'google_place')),
  constraint event_locations_manual_label_check check (
    kind <> 'manual' or nullif(btrim(host_label), '') is not null
  ),
  constraint event_locations_google_place_id_check check (
    kind <> 'google_place' or nullif(btrim(google_place_id), '') is not null
  )
);

-- The one-year upper bound is a V1 safety cap for reminder scheduling.
create table public.event_reminders (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  recipient_profile_id uuid not null references public.profiles (id) on delete cascade,
  channel varchar(20) not null default 'in_app',
  minutes_before integer not null,
  created_at timestamptz not null default now(),
  constraint event_reminders_channel_check check (channel in ('in_app', 'email', 'push')),
  constraint event_reminders_minutes_before_check check (
    minutes_before between 0 and 525600
  ),
  constraint event_reminders_delivery_key unique (
    event_id,
    recipient_profile_id,
    channel,
    minutes_before
  )
);

create index event_reminders_event_id_idx on public.event_reminders (event_id);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  weekday smallint not null,
  starts_local_time time not null,
  ends_local_time time not null,
  time_zone varchar(64) not null default 'Etc/UTC',
  effective_from date,
  effective_until date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_rules_weekday_check check (weekday between 1 and 7),
  constraint availability_rules_interval_check check (ends_local_time > starts_local_time),
  constraint availability_rules_time_zone_valid_check check (
    public.is_valid_time_zone(time_zone)
  ),
  constraint availability_rules_effective_range_check check (
    effective_from is null
    or effective_until is null
    or effective_until > effective_from
  )
);

create index availability_rules_profile_weekday_idx
  on public.availability_rules (profile_id, weekday);

create table public.availability_blocks (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  kind varchar(20) not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  time_zone varchar(64),
  note varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint availability_blocks_kind_check check (kind in ('available', 'unavailable')),
  constraint availability_blocks_interval_check check (ends_at > starts_at),
  constraint availability_blocks_time_zone_valid_check check (
    time_zone is null or public.is_valid_time_zone(time_zone)
  )
);

create index availability_blocks_profile_interval_idx
  on public.availability_blocks (profile_id, starts_at, ends_at);

create table public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  event_id uuid references public.events (id) on delete cascade,
  recipient_profile_id uuid references public.profiles (id) on delete set null,
  recipient_email text,
  channel varchar(20) not null,
  kind varchar(20) not null,
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  status varchar(20) not null default 'pending',
  provider_message_id text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint notification_deliveries_email_normalized_check check (
    recipient_email is null
    or (recipient_email = lower(btrim(recipient_email)) and btrim(recipient_email) <> '')
  ),
  constraint notification_deliveries_channel_not_blank_check check (btrim(channel) <> ''),
  constraint notification_deliveries_kind_not_blank_check check (btrim(kind) <> ''),
  constraint notification_deliveries_status_check check (
    status in ('pending', 'sent', 'failed', 'cancelled')
  )
);

create index notification_deliveries_pending_scheduled_for_idx
  on public.notification_deliveries (scheduled_for)
  where status = 'pending';

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_profile_id uuid references public.profiles (id) on delete set null,
  action varchar(80) not null,
  entity_type varchar(80) not null,
  entity_id uuid not null,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  constraint audit_log_action_not_blank_check check (btrim(action) <> ''),
  constraint audit_log_entity_type_not_blank_check check (btrim(entity_type) <> '')
);

create index audit_log_entity_history_idx
  on public.audit_log (entity_type, entity_id, occurred_at desc);

create table public.outbox_messages (
  id uuid primary key default gen_random_uuid(),
  aggregate_type varchar(80) not null,
  aggregate_id uuid not null,
  event_type varchar(80) not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  attempt_count integer not null default 0,
  last_error text,
  constraint outbox_messages_aggregate_type_not_blank_check check (btrim(aggregate_type) <> ''),
  constraint outbox_messages_event_type_not_blank_check check (btrim(event_type) <> ''),
  constraint outbox_messages_attempt_count_nonnegative_check check (attempt_count >= 0)
);

create index outbox_messages_unprocessed_occurred_at_idx
  on public.outbox_messages (occurred_at)
  where processed_at is null;

-- A soft-deleted or cancelled series must immediately lose guest-link access
-- and stop queued event-specific deliveries. Final hard deletion then removes
-- the dependent rows through their foreign-key cascades.
create or replace function public.handle_event_deactivation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status = 'cancelled' and old.status <> 'cancelled')
    or (new.deleted_at is not null and old.deleted_at is null) then
    update public.event_invitations as invitation
    set revoked_at = now()
    from public.event_attendees as attendee
    where invitation.event_attendee_id = attendee.id
      and attendee.event_id = new.id
      and invitation.revoked_at is null;

    update public.notification_deliveries
    set status = 'cancelled'
    where event_id = new.id
      and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger calendars_set_updated_at
  before update on public.calendars
  for each row execute function public.set_updated_at();

create trigger events_set_updated_at
  before update on public.events
  for each row execute function public.set_updated_at();

create trigger events_require_next_row_version
  before update on public.events
  for each row execute function public.require_next_event_row_version();

create trigger events_revoke_links_on_deactivation
  after update of status, deleted_at on public.events
  for each row execute function public.handle_event_deactivation();

create trigger event_occurrence_overrides_set_updated_at
  before update on public.event_occurrence_overrides
  for each row execute function public.set_updated_at();

create trigger event_locations_set_updated_at
  before update on public.event_locations
  for each row execute function public.set_updated_at();

create trigger availability_rules_set_updated_at
  before update on public.availability_rules
  for each row execute function public.set_updated_at();

create trigger availability_blocks_set_updated_at
  before update on public.availability_blocks
  for each row execute function public.set_updated_at();

create trigger notification_deliveries_set_updated_at
  before update on public.notification_deliveries
  for each row execute function public.set_updated_at();

-- Row Level Security is the browser data-access boundary. Tables with no
-- policy below intentionally have no direct browser access and must be used by
-- trusted Edge Functions, RPCs, or server-side jobs.
alter table public.profiles enable row level security;
alter table public.calendars enable row level security;
alter table public.events enable row level security;
alter table public.event_occurrence_overrides enable row level security;
alter table public.event_attendees enable row level security;
alter table public.event_invitations enable row level security;
alter table public.event_locations enable row level security;
alter table public.event_reminders enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_blocks enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.audit_log enable row level security;
alter table public.outbox_messages enable row level security;

create policy profiles_select_own_active
  on public.profiles
  for select
  to authenticated
  using (id = auth.uid() and deleted_at is null);

create policy profiles_update_own_active
  on public.profiles
  for update
  to authenticated
  using (id = auth.uid() and deleted_at is null)
  with check (id = auth.uid() and deleted_at is null);

-- Calendars and events can be soft-deleted through an UPDATE, but no browser
-- policy permits direct hard deletion or restoration after soft deletion.
create policy calendars_select_own_active
  on public.calendars
  for select
  to authenticated
  using (
    owner_profile_id = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  );

create policy calendars_insert_own_active
  on public.calendars
  for insert
  to authenticated
  with check (
    owner_profile_id = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  );

create policy calendars_update_own_active
  on public.calendars
  for update
  to authenticated
  using (
    owner_profile_id = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  )
  with check (
    owner_profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  );

create policy events_select_owner_active
  on public.events
  for select
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.calendars as calendar_record
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where calendar_record.id = calendar_id
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy events_insert_owner_active
  on public.events
  for insert
  to authenticated
  with check (
    created_by_profile_id = auth.uid()
    and deleted_at is null
    and exists (
      select 1
      from public.calendars as calendar_record
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where calendar_record.id = calendar_id
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy events_update_owner_active
  on public.events
  for update
  to authenticated
  using (
    deleted_at is null
    and exists (
      select 1
      from public.calendars as calendar_record
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where calendar_record.id = calendar_id
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  )
  with check (
    created_by_profile_id = auth.uid()
    and exists (
      select 1
      from public.calendars as calendar_record
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where calendar_record.id = calendar_id
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy event_occurrence_overrides_owner_all
  on public.event_occurrence_overrides
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  )
  with check (
    updated_by_profile_id = auth.uid()
    and exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy event_attendees_owner_all
  on public.event_attendees
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy event_locations_owner_all
  on public.event_locations
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy event_reminders_owner_all
  on public.event_reminders
  for all
  to authenticated
  using (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  )
  with check (
    exists (
      select 1
      from public.events as event_record
      join public.calendars as calendar_record
        on calendar_record.id = event_record.calendar_id
      join public.profiles as profile_record
        on profile_record.id = calendar_record.owner_profile_id
      where event_record.id = event_id
        and event_record.deleted_at is null
        and calendar_record.owner_profile_id = auth.uid()
        and calendar_record.deleted_at is null
        and profile_record.deleted_at is null
    )
  );

create policy availability_rules_owner_all
  on public.availability_rules
  for all
  to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  );

create policy availability_blocks_owner_all
  on public.availability_blocks
  for all
  to authenticated
  using (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  )
  with check (
    profile_id = auth.uid()
    and exists (
      select 1
      from public.profiles as profile_record
      where profile_record.id = auth.uid()
        and profile_record.deleted_at is null
    )
  );

-- RLS policies do not grant table privileges. Start from no browser-facing
-- privileges, then grant only the operations supported by the V1 policies.
-- Trusted Edge Functions and background jobs use Supabase's service_role.
grant usage on schema public to authenticated, service_role, supabase_auth_admin;

-- PostgreSQL exposes new functions to PUBLIC by default. These privileged
-- functions are trigger-only, so no Data API role may call or attach them to
-- another table. Supabase Auth retains explicit execution for its two triggers.
revoke execute on function public.handle_new_user()
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_auth_user_email_change()
  from public, anon, authenticated, service_role;
revoke execute on function public.add_event_creator_as_organizer()
  from public, anon, authenticated, service_role;
revoke execute on function public.handle_event_deactivation()
  from public, anon, authenticated, service_role;

grant execute on function public.handle_new_user() to supabase_auth_admin;
grant execute on function public.handle_auth_user_email_change() to supabase_auth_admin;

revoke all privileges on table
  public.profiles,
  public.calendars,
  public.events,
  public.event_occurrence_overrides,
  public.event_attendees,
  public.event_invitations,
  public.event_locations,
  public.event_reminders,
  public.availability_rules,
  public.availability_blocks,
  public.notification_deliveries,
  public.audit_log,
  public.outbox_messages
from public, anon, authenticated;

grant all privileges on table
  public.profiles,
  public.calendars,
  public.events,
  public.event_occurrence_overrides,
  public.event_attendees,
  public.event_invitations,
  public.event_locations,
  public.event_reminders,
  public.availability_rules,
  public.availability_blocks,
  public.notification_deliveries,
  public.audit_log,
  public.outbox_messages
to service_role;

-- Auth owns the email snapshot and account-deletion lifecycle. The browser may
-- edit only presentation preferences on its own active profile.
grant select on table public.profiles to authenticated;
grant update (display_name, time_zone, locale)
  on table public.profiles to authenticated;

-- Personal-calendar rows are soft-deleted with UPDATE; direct DELETE is
-- intentionally not available to browser clients.
grant select, insert, update on table public.calendars to authenticated;
grant select, insert, update on table public.events to authenticated;

grant select, insert, update, delete on table
  public.event_occurrence_overrides,
  public.event_attendees,
  public.event_locations,
  public.event_reminders,
  public.availability_rules,
  public.availability_blocks
to authenticated;

commit;
