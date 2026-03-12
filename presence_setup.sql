-- Online Presence Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Add status and last_seen columns to app_users
ALTER TABLE public.app_users
ADD COLUMN IF NOT EXISTS status_text TEXT DEFAULT '',
ADD COLUMN IF NOT EXISTS last_seen TIMESTAMPTZ DEFAULT NOW();

-- 2. Ensure RLS policies allow authenticated users to update their own status/last_seen
-- (We already have permissive policies for app_users updates in full_setup.sql, 
-- but this is here for explicitly communicating the requirement)

-- 3. No extra tables are needed for Presence itself, Supabase Realtime handles the ephemeral state via Channels.
