-- ==============================================================================
-- CANVA OTP RELAY - SUPABASE SQL SCHEMA
-- Executed in Supabase SQL Editor
-- ==============================================================================

-- 1. Create allowed_users table for team access whitelist
CREATE TABLE IF NOT EXISTS public.allowed_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    full_name TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Create otp_logs table
CREATE TABLE IF NOT EXISTS public.otp_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT NOT NULL,
    sender TEXT NOT NULL,
    subject TEXT,
    gmail_message_id TEXT UNIQUE NOT NULL,
    received_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired'))
);

-- Index for fast lookup & sorting
CREATE INDEX IF NOT EXISTS idx_otp_logs_received_at ON public.otp_logs (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_otp_logs_gmail_msg_id ON public.otp_logs (gmail_message_id);

-- Enable Row Level Security (RLS)
ALTER TABLE public.allowed_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.otp_logs ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies for allowed_users
-- Authenticated users can view allowed_users list if their email is in allowed_users
CREATE POLICY "Allow whitelisted users to read allowed_users"
ON public.allowed_users
FOR SELECT
TO authenticated
USING (
    LOWER(auth.jwt() ->> 'email') IN (
        SELECT LOWER(email) FROM public.allowed_users
    )
);

-- 4. RLS Policies for otp_logs
-- Allow all authenticated users to SELECT from otp_logs
CREATE POLICY "Allow authenticated users to read otp_logs"
ON public.otp_logs
FOR SELECT
TO authenticated
USING (true);

-- Note: Webhook insertions use the SUPABASE_SERVICE_ROLE_KEY which bypasses RLS automatically.

-- 5. Enable Supabase Realtime for otp_logs table
ALTER PUBLICATION supabase_realtime ADD TABLE public.otp_logs;

-- 6. Insert initial team whitelist example (Change/add your team emails here)
INSERT INTO public.allowed_users (email, full_name)
VALUES 
    ('ceksosial3@gmail.com', 'Team Mailbox Admin')
ON CONFLICT (email) DO NOTHING;
