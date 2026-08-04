-- ============================================================================
-- Espelho do app da Shopee — O AGENDADOR da fila de reconferencia.
--
-- Pedido do Victor (04/08): "a fila deve funcionar sozinha de forma sempre
-- automatica". Sem isto, um print que caiu na cota do dia so seria reconferido
-- quando outro driver enviasse um print (reprocessamento oportunista) ou quando
-- alguem abrisse o painel. Com isto, o proprio banco chama a edge fn de 15 em 15
-- minutos e esvazia a fila — sem ninguem fazer nada.
--
-- POR QUE ISTO EXISTE: no plano gratuito do Gemini a cota e de 20 leituras por
-- dia POR MODELO. Numa leva de ~89 drivers ela pode acabar no meio; quem sobrar
-- fica `check_status='pendente'` com `next_check_at` preenchido, e este job vem
-- buscar depois — inclusive no dia seguinte, quando a cota reseta.
--
-- ⚠️ ESTA MIGRATION MEXE EM INFRA DO BANCO (instala 2 extensoes e cria um job
-- agendado). E a unica deste conjunto que faz isso. Aplicar SOMENTE com OK
-- explicito do Victor. Rollback completo no rodape.
--
-- ⚠️ ORDEM DE APLICACAO — os 3 passos abaixo, NESTA ordem:
--   1. setar o secret PROOF_QUEUE_SECRET nos Edge Function Secrets do Dashboard;
--   2. rodar a PARTE 2 daqui (guarda o MESMO valor no vault do Postgres);
--   3. deployar a driver-public-api com a rota `proof-process-queue`.
-- Fora de ordem o job so vai tomar 401 — sem estrago, mas sem funcionar.
-- ============================================================================

-- ⚠️ APLICADA EM PROD EM 04/08/2026, em partes, com o que se aprendeu no caminho:
--   · `net.http_post` (schema `net`), NAO `extensions.http_post` — conferido antes
--     de agendar; chutar errado faria o job falhar em silencio a cada 15 min;
--   · o role `postgres` do Supabase NAO enxerga `cron.job` por padrao: e preciso o
--     GRANT da PARTE 0 (a UI de Cron Jobs do Dashboard faz isso sozinha);
--   · mesmo com o GRANT o `postgres` le mas NAO altera `cron.job`, entao "pausar"
--     (`UPDATE cron.job SET active=false`) so funciona pelo Dashboard. Para pausar
--     por SQL, reagende com uma data que nao chega (ver PARTE 3);
--   · o segredo real NAO esta neste arquivo de proposito — ele foi passado na hora
--     da aplicacao. Aqui fica o placeholder pra nao vazar segredo pro git.

-- ---------- PARTE 0: permissao (a UI do Dashboard faz isso automaticamente) ----------
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- ---------- PARTE 1: extensoes ----------
-- pg_cron: agendador dentro do Postgres. pg_net: HTTP assincrono (e ele que
-- chama a edge fn). Ambos ja vem disponiveis no Supabase, so nao instalados.
-- ⚠️ Sem `WITH SCHEMA`: o pg_net cria o proprio schema `net` e e la que a funcao
-- fica (`net.http_post`). Conferido em prod antes de agendar — chutar
-- `extensions.http_post` faria o job falhar em silencio a cada 15 minutos.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ---------- PARTE 2: o segredo ----------
-- O mesmo valor que esta nos Edge Function Secrets. Fica no vault (cifrado) e
-- NAO no texto do job — assim quem lista `cron.job` nao le o segredo.
--
-- ⚠️ SUBSTITUA <COLE_O_SECRET_AQUI> pelo valor real antes de rodar.
-- (Se ja existir, atualiza o valor em vez de duplicar.)
DO $vault$
DECLARE
  v_secret text := '<COLE_O_SECRET_AQUI>';
  v_id uuid;
BEGIN
  IF v_secret = '<COLE_O_' || 'SECRET_AQUI>' THEN
    RAISE EXCEPTION 'Substitua <COLE_O_SECRET_AQUI> pelo valor real do PROOF_QUEUE_SECRET antes de aplicar.';
  END IF;
  SELECT id INTO v_id FROM vault.secrets WHERE name = 'proof_queue_secret';
  IF v_id IS NULL THEN
    PERFORM vault.create_secret(v_secret, 'proof_queue_secret',
      'Espelho do app: segredo da rota proof-process-queue da driver-public-api. Mesmo valor do Edge Function Secret PROOF_QUEUE_SECRET.');
  ELSE
    PERFORM vault.update_secret(v_id, v_secret);
  END IF;
END $vault$;

-- ---------- PARTE 3: o job ----------
-- De 15 em 15 minutos. Quase toda rodada nao faz nada (a consulta da fila usa
-- indice parcial e volta vazia num piscar) — o custo real so aparece quando ha
-- print esperando. O limite de 10 por rodada da 960 leituras/dia de capacidade,
-- MUITO acima da cota, entao o gargalo continua sendo a cota e nunca o agendador.
--
-- ⚠️ ORDEM: enquanto a edge fn no ar nao tiver a rota `proof-process-queue`, este
-- job so tomaria 400 a cada 15 minutos. Por isso em 04/08 ele foi criado com
-- `'0 5 29 2 *'` (29 de fevereiro — so em ano bissexto, proximo 2028), ou seja
-- DORMINDO, e deve ser reagendado com `'*/15 * * * *'` no momento do deploy.
-- `cron.schedule` com o MESMO nome sobrescreve, entao reagendar e so rodar isto
-- de novo com a expressao certa. Esse mesmo truque serve pra "pausar" por SQL,
-- ja que o role postgres nao consegue dar UPDATE em cron.job.
SELECT cron.schedule(
  'driverpay-proof-queue',
  '*/15 * * * *',
  $job$
  SELECT net.http_post(
    url     := 'https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/driver-public-api',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (
        SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'proof_queue_secret'
      )
    ),
    body    := jsonb_build_object('action', 'proof-process-queue', 'limit', 10),
    timeout_milliseconds := 120000
  );
  $job$
);

COMMENT ON EXTENSION pg_cron IS
  'Agendador do Postgres. Usado pelo job driverpay-proof-queue, que esvazia a fila de reconferencia dos prints do espelho do app (04/08/2026).';

-- ============================================================================
-- CONFERIR DEPOIS DE APLICAR:
--   SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'driverpay-proof-queue';
--   SELECT status, return_message, start_time
--     FROM cron.job_run_details
--    WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'driverpay-proof-queue')
--    ORDER BY start_time DESC LIMIT 5;
--   -- quem esta na fila agora:
--   SELECT count(*) FROM driverpay_delivery_proofs WHERE next_check_at IS NOT NULL;
--
-- PAUSAR sem desinstalar nada (se der problema):
--   UPDATE cron.job SET active = false WHERE jobname = 'driverpay-proof-queue';
--
-- ROLLBACK (se precisar):
--   SELECT cron.unschedule('driverpay-proof-queue');
--   DELETE FROM vault.secrets WHERE name = 'proof_queue_secret';
--   -- as extensoes podem ficar (nao atrapalham nada); se quiser tirar mesmo:
--   -- DROP EXTENSION IF EXISTS pg_net;
--   -- DROP EXTENSION IF EXISTS pg_cron;
-- ============================================================================
