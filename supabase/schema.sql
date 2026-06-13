create extension if not exists pgcrypto;

create table if not exists public.reading_list_urls (
  id uuid primary key default gen_random_uuid(),
  sync_key_hash text not null,
  url text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists reading_list_urls_sync_url_idx
  on public.reading_list_urls (sync_key_hash, url);

create index if not exists reading_list_urls_sync_created_idx
  on public.reading_list_urls (sync_key_hash, created_at desc);

alter table public.reading_list_urls enable row level security;

drop function if exists public.list_reading_urls(text);
drop function if exists public.create_reading_url(text, text);

create or replace function public.list_reading_urls(p_sync_key_hash text)
returns table (
  id uuid,
  url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $function$
  select
    rlu.id,
    rlu.url,
    rlu.created_at
  from public.reading_list_urls
    as rlu
  where rlu.sync_key_hash = p_sync_key_hash
  order by rlu.created_at desc;
$function$;

create or replace function public.create_reading_url(
  p_sync_key_hash text,
  p_url text
)
returns table (
  id uuid,
  url text,
  created_at timestamptz
)
language sql
security definer
set search_path = public
as $function$
  with inserted as (
    insert into public.reading_list_urls (
      sync_key_hash,
      url
    )
    values (
      p_sync_key_hash,
      p_url
    )
    on conflict (sync_key_hash, url) do nothing
    returning
      public.reading_list_urls.id,
      public.reading_list_urls.url,
      public.reading_list_urls.created_at
  )
  select
    inserted.id,
    inserted.url,
    inserted.created_at
  from inserted
  union all
  select
    existing.id,
    existing.url,
    existing.created_at
  from public.reading_list_urls as existing
  where existing.sync_key_hash = p_sync_key_hash
    and existing.url = p_url
    and not exists (select 1 from inserted)
  limit 1;
$function$;

revoke all on public.reading_list_urls from anon, authenticated;
grant execute on function public.list_reading_urls(text) to anon;
grant execute on function public.create_reading_url(text, text) to anon;
