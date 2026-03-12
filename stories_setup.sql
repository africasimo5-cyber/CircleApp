-- Stories Feature Setup (REPAIR SCRIPT)
-- Run this in your Supabase SQL Editor

-- 1. Table Setup
CREATE TABLE IF NOT EXISTS public.stories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('image', 'video')),
    url TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RELAX PERMISSIONS (CRITICAL FIX)
-- We disable RLS because the app uses custom authentication.
ALTER TABLE public.stories DISABLE ROW LEVEL SECURITY;

-- In case it was already disabled, also add a permissive policy just in case it gets re-enabled
DROP POLICY IF EXISTS "Stories Permissive" ON public.stories;
CREATE POLICY "Stories Permissive" ON public.stories FOR ALL USING (true) WITH CHECK (true);

-- 3. STORAGE BUCKET SETUP
-- Ensure the 'stories' bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('stories', 'stories', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- 4. STORAGE POLICIES
-- Allow any public access to the stories bucket objects
DROP POLICY IF EXISTS "Storage Select" ON storage.objects;
CREATE POLICY "Storage Select" ON storage.objects FOR SELECT TO public USING (bucket_id = 'stories');

DROP POLICY IF EXISTS "Storage Insert" ON storage.objects;
CREATE POLICY "Storage Insert" ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'stories');

DROP POLICY IF EXISTS "Storage Update" ON storage.objects;
CREATE POLICY "Storage Update" ON storage.objects FOR UPDATE TO public USING (bucket_id = 'stories');

DROP POLICY IF EXISTS "Storage Delete" ON storage.objects;
CREATE POLICY "Storage Delete" ON storage.objects FOR DELETE TO public USING (bucket_id = 'stories');

-- 5. Auto-Deletion Job (Optional, needs pg_cron)
-- CREATE EXTENSION IF NOT EXISTS pg_cron;
-- SELECT cron.schedule('delete-old-stories', '0 * * * *', $$
--   DELETE FROM public.stories WHERE created_at < now() - interval '10 hours';
-- $$);

-- Indices
CREATE INDEX IF NOT EXISTS idx_stories_user_id ON public.stories(user_id);
CREATE INDEX IF NOT EXISTS idx_stories_created_at ON public.stories(created_at);
