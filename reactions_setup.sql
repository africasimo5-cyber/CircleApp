-- Emoji Reactions Setup
-- Run this script in your Supabase SQL Editor

-- 1. Create the target table
CREATE TABLE IF NOT EXISTS public.message_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id UUID NOT NULL REFERENCES public.messages(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    emoji TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    -- Ensure a user can only leave one specific emoji per message (can't ❤️ twice)
    UNIQUE(message_id, user_id, emoji)
);

-- 2. Relax Row Level Security (RLS) for development
-- Since the app handles auth manually, we disable strict RLS but provide a fallback permissive policy.
ALTER TABLE public.message_reactions DISABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Message Reactions Permissive" ON public.message_reactions;
CREATE POLICY "Message Reactions Permissive" ON public.message_reactions FOR ALL USING (true) WITH CHECK (true);

-- 3. Essential Indices for fast aggregations
CREATE INDEX IF NOT EXISTS idx_msg_reactions_msg_id ON public.message_reactions(message_id);
CREATE INDEX IF NOT EXISTS idx_msg_reactions_user_id ON public.message_reactions(user_id);

-- 4. Enable Realtime
-- This forces Supabase to broadcast changes to this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.message_reactions;
