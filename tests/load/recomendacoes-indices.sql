-- NÃO APLICADO. Sugestão para rodar no branch de TESTE do Neon primeiro (regra do projeto: mudança aditiva, testar em branch).
-- Hoje (250 alunos) as consultas levam <0,3 ms e o Postgres escolhe Seq Scan por a tabela ser minúscula; estes índices
-- só passam a importar com milhares de alunos, mas são baratos e as consultas já filtram exatamente por essas colunas.
-- Antes, confira o que já existe no Neon: SELECT tablename, indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1;
CREATE INDEX IF NOT EXISTS student_account_links_account_idx ON student_account_links (account_id);
CREATE INDEX IF NOT EXISTS workout_sessions_workout_idx      ON workout_sessions (workout_id, position);
CREATE INDEX IF NOT EXISTS workout_exercises_session_idx     ON workout_exercises (session_id, position);
CREATE INDEX IF NOT EXISTS students_personal_idx             ON students (personal_id);
CREATE INDEX IF NOT EXISTS subscriptions_student_idx         ON subscriptions (student_id, starts_at DESC);
CREATE INDEX IF NOT EXISTS subscriptions_personal_idx        ON subscriptions (personal_id, status);
CREATE INDEX IF NOT EXISTS checkins_student_idx              ON checkins (student_id, created_at DESC);
CREATE INDEX IF NOT EXISTS workout_executions_session_idx    ON workout_executions (student_id, session_id, finished_at DESC);
