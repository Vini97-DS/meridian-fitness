-- SOMENTE para o harness LOCAL de testes (tests/e2e/local). Reconstrução mínima das tabelas-base que o
-- api.py NÃO cria (elas já existem no Neon). Num branch de teste do Neon real isto NÃO é usado.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE TYPE student_goal AS ENUM ('emagrecimento','hipertrofia','saude_geral','condicionamento','reabilitacao','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE acquisition_channel AS ENUM ('instagram','tiktok','youtube','google','indicacao','indicacao_paga','trafego_pago','conteudo','outro'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE checkin_type AS ENUM ('semanal','mensal','trimestral'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE TABLE IF NOT EXISTS personals (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), clerk_user_id TEXT UNIQUE, name TEXT, email TEXT, bio TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS students (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), personal_id UUID REFERENCES personals(id), name TEXT NOT NULL, phone TEXT, email TEXT,
  goal student_goal DEFAULT 'outro', channel acquisition_channel DEFAULT 'outro', status TEXT DEFAULT 'active', weight_initial NUMERIC, weight_current NUMERIC, height_cm NUMERIC,
  bf_initial NUMERIC, bf_current NUMERIC, notes TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS plans (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), personal_id UUID REFERENCES personals(id), name TEXT NOT NULL, duration_months INT NOT NULL DEFAULT 1,
  price NUMERIC NOT NULL DEFAULT 0, is_active BOOLEAN DEFAULT TRUE, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS subscriptions (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID REFERENCES students(id), personal_id UUID REFERENCES personals(id),
  plan_id UUID REFERENCES plans(id), price_paid NUMERIC, starts_at DATE, expires_at DATE, payment_method TEXT, status TEXT DEFAULT 'active', created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS checkins (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID REFERENCES students(id), personal_id UUID REFERENCES personals(id), type checkin_type,
  training_feedback TEXT, trainings_done INT, had_pain BOOLEAN, pain_description TEXT, nutrition_notes TEXT, mood_score INT, energy_score INT, weight_reported NUMERIC, bf_measured NUMERIC,
  general_notes TEXT, intensity_score INT, nutrition_score INT, created_at TIMESTAMPTZ DEFAULT NOW(), responded_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS leads (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), personal_id UUID REFERENCES personals(id), name TEXT, phone TEXT, channel TEXT, status TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS form_tokens (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID REFERENCES students(id), personal_id UUID REFERENCES personals(id), token TEXT UNIQUE,
  form_type TEXT, used BOOLEAN DEFAULT FALSE, expires_at TIMESTAMPTZ, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS progress_photos (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), student_id UUID REFERENCES students(id), url TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
CREATE TABLE IF NOT EXISTS invites (id UUID PRIMARY KEY DEFAULT gen_random_uuid(), email TEXT, created_at TIMESTAMPTZ DEFAULT NOW());
