-- Auditoria de índices/planos com o volume do seed de carga (somente leitura: EXPLAIN ANALYZE de SELECTs).
\pset pager off
\echo '== tamanhos =='
select relname, n_live_tup as linhas from pg_stat_user_tables where relname in ('students','subscriptions','workouts','workout_sessions','workout_exercises','workout_executions','workout_execution_sets','student_account_links','student_accounts','checkins','auth_rate_limit','login_codes') order by 2 desc;
\echo '== índices existentes (tabelas quentes) =='
select tablename, indexname, indexdef from pg_indexes where schemaname='public' and tablename in ('students','subscriptions','workouts','workout_sessions','workout_exercises','workout_executions','workout_execution_sets','student_account_links','student_accounts','checkins','auth_rate_limit','login_codes','exercises','plans') order by tablename, indexname;
select s.id as sid, s.personal_id as pid, a.id as aid, w.id as wid, ws.id as sess from students s join student_accounts a on a.email=s.email join workouts w on w.student_id=s.id join workout_sessions ws on ws.workout_id=w.id where s.email like '%@load.meridian.test' order by s.email limit 1 \gset
\echo '== planos (EXPLAIN ANALYZE) — procure "Seq Scan" em tabelas grandes =='
\echo '-- 1 aluno_me/treino: links por account_id'
explain (analyze, costs off, timing off) select s.id from student_account_links l join students s on s.id=l.student_id where l.account_id=:'aid' and s.personal_id=:'pid';
\echo '-- 2 ficha ativa do aluno'
explain (analyze, costs off, timing off) select * from workouts where student_id=:'sid' and status='ativa';
\echo '-- 3 sessões da ficha'
explain (analyze, costs off, timing off) select id,name,weekdays,position from workout_sessions where workout_id=:'wid' order by position;
\echo '-- 4 exercícios da sessão'
explain (analyze, costs off, timing off) select we.id from workout_exercises we join exercises e on e.id=we.exercise_id where we.session_id=:'sess' order by we.position;
\echo '-- 5 histórico do aluno (20 últimas concluídas)'
explain (analyze, costs off, timing off) select * from workout_executions where student_id=:'sid' and finished_at is not null order by finished_at desc limit 20;
\echo '-- 6 séries de uma execução'
explain (analyze, costs off, timing off) select * from workout_execution_sets where execution_id=(select id from workout_executions where student_id=:'sid' limit 1) order by set_number;
\echo '-- 7 última vez (iniciar execução)'
explain (analyze, costs off, timing off) select we.id from workout_executions we where we.session_id=:'sess' and we.student_id=:'sid' and we.finished_at is not null order by we.finished_at desc limit 1;
\echo '-- 8 lista de alunos do personal (get_students)'
explain (analyze, costs off, timing off) select s.id from students s join subscriptions sub on sub.student_id=s.id where s.personal_id=:'pid';
\echo '-- 9 assinaturas do aluno'
explain (analyze, costs off, timing off) select min(starts_at) from subscriptions where student_id=:'sid';
\echo '-- 10 peso recente (checkins)'
explain (analyze, costs off, timing off) select id from checkins where student_id=:'sid' and weight_reported is not null and created_at > now() - interval '7 days';
\echo '-- 11 limite de login (por e-mail / por IP)'
explain (analyze, costs off, timing off) select count(*) from login_codes where email='x@x.test' and created_at > now() - interval '1 hour';
explain (analyze, costs off, timing off) select count(*) from auth_rate_limit where rl_key='req:1.2.3.4' and created_at > now() - interval '1 hour';
