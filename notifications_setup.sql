-- Message Notifications Setup Script
-- Run this in your Supabase SQL Editor

-- 1. Create unread_counts table
CREATE TABLE IF NOT EXISTS public.unread_counts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    chat_id UUID NOT NULL, -- Either a user ID (for DMs) or a circle ID
    chat_type TEXT NOT NULL CHECK (chat_type IN ('direct', 'circle')),
    count INTEGER NOT NULL DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, chat_id)
);

-- 2. Enable RLS
ALTER TABLE public.unread_counts ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies
DROP POLICY IF EXISTS "unread_counts_read_own" ON public.unread_counts;
CREATE POLICY "unread_counts_read_own" ON public.unread_counts
FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS "unread_counts_update_own" ON public.unread_counts;
CREATE POLICY "unread_counts_update_own" ON public.unread_counts
FOR UPDATE USING (user_id = auth.uid());

DROP POLICY IF EXISTS "unread_counts_insert_own" ON public.unread_counts;
CREATE POLICY "unread_counts_insert_own" ON public.unread_counts
FOR INSERT WITH CHECK (user_id = auth.uid());

-- Since we are using manual auth checks in this app, allow completely 
-- permissive access for the client. Real security would require JWTs.
ALTER TABLE public.unread_counts DISABLE ROW LEVEL SECURITY;
CREATE POLICY "unread_counts_all" ON public.unread_counts FOR ALL USING (true) WITH CHECK (true);

-- 4. Create Trigger to Auto-Increment Unread Counts
CREATE OR REPLACE FUNCTION handle_new_message_unread() 
RETURNS TRIGGER AS $$
BEGIN
    -- If it's a circle message
    IF NEW.circle_id IS NOT NULL THEN
        -- Insert or increment count for all circle members EXCLUDING the sender
        INSERT INTO public.unread_counts (user_id, chat_id, chat_type, count)
        SELECT member.user_id, NEW.circle_id, 'circle', 1
        FROM public.circle_members member
        WHERE member.circle_id = NEW.circle_id AND member.user_id != NEW.sender_id
        ON CONFLICT (user_id, chat_id) 
        DO UPDATE SET count = unread_counts.count + 1, updated_at = now();
    -- If it's a direct message
    ELSE
        -- Insert or increment count for the recipient, where chat_id is the sender
        INSERT INTO public.unread_counts (user_id, chat_id, chat_type, count)
        VALUES (NEW.recipient_id, NEW.sender_id, 'direct', 1)
        ON CONFLICT (user_id, chat_id) 
        DO UPDATE SET count = unread_counts.count + 1, updated_at = now();
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Attach trigger to messages table
DROP TRIGGER IF EXISTS trg_new_message_unread ON public.messages;
CREATE TRIGGER trg_new_message_unread
AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION handle_new_message_unread();

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_unread_counts_user_id ON public.unread_counts(user_id);
