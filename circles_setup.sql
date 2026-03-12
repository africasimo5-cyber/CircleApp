-- Circle (Group Chat) Feature Setup

-- 1. Create Circles Table
CREATE TABLE IF NOT EXISTS public.circles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    owner_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    photo_url TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Create Circle Members Table
CREATE TABLE IF NOT EXISTS public.circle_members (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    circle_id UUID NOT NULL REFERENCES public.circles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.app_users(id) ON DELETE CASCADE,
    joined_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(circle_id, user_id)
);

-- 3. Modify Messages Table
-- Add circle_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='messages' AND column_name='circle_id') THEN
        ALTER TABLE public.messages ADD COLUMN circle_id UUID REFERENCES public.circles(id) ON DELETE CASCADE;
    END IF;
END $$;

-- 4. Enable RLS
ALTER TABLE public.circles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies for Circles
DROP POLICY IF EXISTS "circles_read_member" ON public.circles;
CREATE POLICY "circles_read_member" ON public.circles
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.circle_members
        WHERE circle_id = circles.id AND user_id = auth.uid()
    ) OR owner_id = auth.uid()
);

DROP POLICY IF EXISTS "circles_insert_all" ON public.circles;
CREATE POLICY "circles_insert_all" ON public.circles
FOR INSERT WITH CHECK (true); -- Anyone can create a circle

DROP POLICY IF EXISTS "circles_update_owner" ON public.circles;
CREATE POLICY "circles_update_owner" ON public.circles
FOR UPDATE USING (owner_id = auth.uid());

DROP POLICY IF EXISTS "circles_delete_owner" ON public.circles;
CREATE POLICY "circles_delete_owner" ON public.circles
FOR DELETE USING (owner_id = auth.uid());

-- 6. RLS Policies for Circle Members
DROP POLICY IF EXISTS "members_read_member" ON public.circle_members;
CREATE POLICY "members_read_member" ON public.circle_members
FOR SELECT USING (
    EXISTS (
        SELECT 1 FROM public.circle_members
        WHERE circle_id = circle_members.circle_id AND user_id = auth.uid()
    )
);

DROP POLICY IF EXISTS "members_modify_owner" ON public.circle_members;
CREATE POLICY "members_modify_owner" ON public.circle_members
FOR ALL USING (
    EXISTS (
        SELECT 1 FROM public.circles
        WHERE id = circle_members.circle_id AND owner_id = auth.uid()
    )
);

-- Note: In this simple app setup, we are using the 'app_users' table instead of standard auth.users
-- Since we are using manual password checks, the Policies above using auth.uid() 
-- might need adjustment if you are not using Supabase Auth strictly. 
-- However, for now we will stick to a permissive 'all' approach similar to your previous setup 
-- to ensure it works with your custom auth logic.

ALTER TABLE public.circles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.circle_members DISABLE ROW LEVEL SECURITY;

CREATE POLICY "circles_all" ON public.circles FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "circle_members_all" ON public.circle_members FOR ALL USING (true) WITH CHECK (true);

-- Indices for performance
CREATE INDEX IF NOT EXISTS idx_circles_owner_id ON public.circles(owner_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_circle_id ON public.circle_members(circle_id);
CREATE INDEX IF NOT EXISTS idx_circle_members_user_id ON public.circle_members(user_id);
CREATE INDEX IF NOT EXISTS idx_messages_circle_id ON public.messages(circle_id);
