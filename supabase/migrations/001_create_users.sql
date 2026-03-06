-- supabase/migrations/001_create_users.sql
-- Run this in: Supabase Dashboard → SQL Editor → New Query

create table if not exists public.users (
  id                      uuid primary key default gen_random_uuid(),
  clerk_user_id           text unique not null,
  plan                    text not null default 'free' check (plan in ('free', 'pro', 'team')),
  stripe_customer_id      text,
  stripe_subscription_id  text,
  created_at              timestamptz default now(),
  updated_at              timestamptz default now()
);

-- Index for fast lookups by Clerk user ID (called on every page load)
create index if not exists users_clerk_user_id_idx on public.users (clerk_user_id);

-- Index for Stripe webhook lookups
create index if not exists users_stripe_customer_id_idx on public.users (stripe_customer_id);

-- Row Level Security: users can only read their own row
-- The API uses service_role key which bypasses RLS entirely
alter table public.users enable row level security;

create policy "Users can read own row"
  on public.users for select
  using (auth.uid()::text = clerk_user_id);

-- Auto-update updated_at on any change
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger users_updated_at
  before update on public.users
  for each row execute function update_updated_at();
