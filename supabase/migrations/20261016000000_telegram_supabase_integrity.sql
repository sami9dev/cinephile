-- ============================================================================
-- CINEFUEL TELEGRAM & SUPABASE DATA INTEGRITY MIGRATION
-- Migration: 20261016000000_telegram_supabase_integrity.sql
-- ============================================================================

-- 1. Create public.links table if it doesn't already exist
CREATE TABLE IF NOT EXISTS public.links (
    id TEXT PRIMARY KEY,
    movie_id TEXT NOT NULL,
    title TEXT NOT NULL,
    movie_title TEXT,
    url TEXT NOT NULL,
    category TEXT DEFAULT 'Download',
    quality TEXT,
    codec TEXT,
    audio_language TEXT,
    size TEXT,
    link_type TEXT DEFAULT 'general',
    season_number INT,
    episode_number INT,
    episode_title TEXT,
    manual_title_verified BOOLEAN DEFAULT false,
    server_name TEXT,
    server_badge TEXT,
    media_type TEXT DEFAULT 'movie',
    release_date TEXT,
    poster_path TEXT,
    backdrop_path TEXT,
    overview TEXT,
    vote_average NUMERIC,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Add compound unique constraint on (movie_id, url) to prevent duplicate links
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'uq_links_movie_url'
    ) THEN
        ALTER TABLE public.links 
        ADD CONSTRAINT uq_links_movie_url UNIQUE (movie_id, url);
    END IF;
END $$;

-- 3. Composite index for media type + movie_id lookup (prevents movie vs TV collision)
CREATE INDEX IF NOT EXISTS idx_links_movie_media 
ON public.links (movie_id, media_type);

CREATE INDEX IF NOT EXISTS idx_links_url 
ON public.links (url);

CREATE INDEX IF NOT EXISTS idx_links_created_at 
ON public.links (created_at DESC);

-- 4. Telegram Webhook Idempotency: processed_updates table
CREATE TABLE IF NOT EXISTS public.processed_updates (
    update_id BIGINT PRIMARY KEY,
    chat_id BIGINT,
    processed_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Short-lived bot session store (preserves selection state across serverless instances)
CREATE TABLE IF NOT EXISTS public.bot_sessions (
    id TEXT PRIMARY KEY,
    chat_id BIGINT NOT NULL,
    user_id BIGINT,
    message_id BIGINT,
    movie_id TEXT NOT NULL,
    media_type TEXT NOT NULL DEFAULT 'movie',
    state JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_bot_sessions_chat_user 
ON public.bot_sessions (chat_id, user_id);

-- 6. Enable Row Level Security (RLS)
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processed_updates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bot_sessions ENABLE ROW LEVEL SECURITY;

-- 7. RLS Policies
DO $$
BEGIN
    -- Public read policy for links
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'links' AND policyname = 'Public read access for links'
    ) THEN
        CREATE POLICY "Public read access for links" 
        ON public.links FOR SELECT 
        USING (true);
    END IF;

    -- Service role full access on links
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'links' AND policyname = 'Service role full access on links'
    ) THEN
        CREATE POLICY "Service role full access on links" 
        ON public.links FOR ALL 
        USING (auth.jwt() IS NOT NULL OR current_user = 'authenticated' OR current_user = 'service_role')
        WITH CHECK (true);
    END IF;

    -- Service role full access on processed_updates
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'processed_updates' AND policyname = 'Service role access on processed_updates'
    ) THEN
        CREATE POLICY "Service role access on processed_updates" 
        ON public.processed_updates FOR ALL 
        USING (auth.jwt() IS NOT NULL OR current_user = 'authenticated' OR current_user = 'service_role')
        WITH CHECK (true);
    END IF;

    -- Service role full access on bot_sessions
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE tablename = 'bot_sessions' AND policyname = 'Service role access on bot_sessions'
    ) THEN
        CREATE POLICY "Service role access on bot_sessions" 
        ON public.bot_sessions FOR ALL 
        USING (auth.jwt() IS NOT NULL OR current_user = 'authenticated' OR current_user = 'service_role')
        WITH CHECK (true);
    END IF;
END $$;

-- 8. Atomic title link replacement function (replaces non-atomic delete + insert)
CREATE OR REPLACE FUNCTION public.replace_title_links(
    p_movie_id TEXT,
    p_links JSONB
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Atomic transaction boundary
    DELETE FROM public.links WHERE movie_id = p_movie_id;
    
    IF p_links IS NOT NULL AND jsonb_array_length(p_links) > 0 THEN
        INSERT INTO public.links (
            id, movie_id, title, movie_title, url, category, quality, codec,
            audio_language, size, link_type, season_number, episode_number,
            episode_title, manual_title_verified, server_name, server_badge,
            media_type, release_date, poster_path, backdrop_path, overview,
            vote_average, created_at, updated_at
        )
        SELECT
            COALESCE(elem->>'id', 'tg-' || floor(extract(epoch from now()) * 1000)::text || '-' || substr(md5(random()::text), 1, 4)),
            p_movie_id,
            elem->>'title',
            elem->>'movie_title',
            elem->>'url',
            COALESCE(elem->>'category', 'Download'),
            elem->>'quality',
            elem->>'codec',
            elem->>'audio_language',
            elem->>'size',
            COALESCE(elem->>'link_type', 'general'),
            (elem->>'season_number')::INT,
            (elem->>'episode_number')::INT,
            elem->>'episode_title',
            COALESCE((elem->>'manual_title_verified')::BOOLEAN, false),
            elem->>'server_name',
            elem->>'server_badge',
            COALESCE(elem->>'media_type', 'movie'),
            elem->>'release_date',
            elem->>'poster_path',
            elem->>'backdrop_path',
            elem->>'overview',
            (elem->>'vote_average')::NUMERIC,
            COALESCE(elem->>'created_at', now()::text)::TIMESTAMPTZ,
            now()
        FROM jsonb_array_elements(p_links) AS elem;
    END IF;
END;
$$;
