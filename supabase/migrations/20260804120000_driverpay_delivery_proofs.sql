-- ============================================================================
-- Espelho do app da Shopee conferido sozinho — pedido do Victor em 04/08/2026.
--
-- PROBLEMA: a planilha que a Shopee manda pode vir com a quantidade de pacotes
-- errada por driver. Hoje a equipe cobra de cada driver uma foto da tela do app
-- dele (aba "Encerrado", com o periodo selecionado), recebe por WhatsApp e
-- compara na mao antes de clicar em "Espelho conferido" no painel.
--
-- O QUE ISTO CRIA: a "torneira" que pede o print (driverpay_proof_requests) e os
-- prints recebidos com o resultado da conferencia (driverpay_delivery_proofs),
-- mais o bucket privado onde as imagens ficam.
--
-- DECISOES DO VICTOR (04/08): conferir so a plataforma SHOPEE; quantidade tem que
-- bater EXATO; data errada = recusa na hora com o motivo na tela do driver;
-- quantidade diferente = aceita calado e mostra SO no painel (o driver nunca ve
-- numero nenhum); operador tambem pode anexar pelo painel.
--
-- Namespace driverpay_* : ISOLADO do produto SPX/logistica.
-- 100% ADITIVO e IDEMPOTENTE: nao altera nem remove nada que ja existe — so cria
-- duas tabelas novas, um bucket novo e duas colunas novas em driverpay_settings.
-- Nenhuma linha de dado existente e tocada.
-- Aplicar SOMENTE com OK do Victor. Rollback no rodape.
-- ============================================================================

-- ---------- 1. TABELAS ----------

-- A "torneira". Enquanto nao existir linha aqui pra (empresa, quinzena, plataforma),
-- o portal do driver NAO mostra nada pra anexar. E o que o botao "Solicitar espelho"
-- grava. Uma linha por plataforma permite pedir SHOPEE agora e outra depois.
CREATE TABLE IF NOT EXISTS public.driverpay_proof_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  period_id     uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  platform_name text NOT NULL CHECK (length(btrim(platform_name)) > 0),  -- string, igual driverpay_payment_packages.platform_name
  requested_at  timestamptz NOT NULL DEFAULT now(),
  requested_by  text REFERENCES public.users(id) ON DELETE SET NULL,
  UNIQUE (company_id, period_id, platform_name)
);

-- Os prints recebidos. 1 linha por arquivo enviado (reenvio cria outra linha, o
-- historico fica inteiro pra auditoria — mesmo desenho da NF).
CREATE TABLE IF NOT EXISTS public.driverpay_delivery_proofs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  -- DE QUEM e o print. Num grupo, quem ENVIA e o lider (uploaded_by), mas o print
  -- e de um membro — e o pagamento daquele membro que fica verde.
  driver_id         uuid NOT NULL REFERENCES public.driverpay_drivers(id) ON DELETE CASCADE,
  period_id         uuid NOT NULL REFERENCES public.driverpay_periods(id) ON DELETE CASCADE,
  payment_id        uuid REFERENCES public.driverpay_payments(id) ON DELETE CASCADE,
  platform_name     text NOT NULL CHECK (length(btrim(platform_name)) > 0),

  file_path         text NOT NULL CHECK (length(btrim(file_path)) > 0),  -- bucket privado driverpay-delivery-proofs
  file_type         text,                                                -- mime (image/jpeg, image/png...)
  original_filename text,
  -- Impressao digital do arquivo. O app da Shopee NAO mostra o nome do driver na
  -- tela, entao o sistema nao tem como saber de quem e a foto — se o mesmo arquivo
  -- aparecer em dois drivers, o painel AVISA (nao trava; a decisao e do Victor).
  file_sha256       text,
  upload_source     text NOT NULL DEFAULT 'app' CHECK (upload_source IN ('app','painel')),
  uploaded_at       timestamptz NOT NULL DEFAULT now(),
  uploaded_by       text,   -- driver_id (lider/driver) OU users.id (operador). Sem FK: driver nao e users.

  status            text NOT NULL DEFAULT 'recebido' CHECK (status IN ('recebido','validado','rejeitado')),
  reject_reason     text,
  validated_at      timestamptz,
  -- FK pra users(id): validacao AUTOMATICA fica NULL e o marcador vive em
  -- check_details.autoConfirmed (mesma licao da NF — gravar 'auto' violava a FK).
  validated_by      text REFERENCES public.users(id) ON DELETE SET NULL,

  -- ---- resultado da conferencia (espelha o ProofCheckResult de _shared/proofCheck.ts) ----
  check_status      text CHECK (check_status IN ('ok','divergente','periodo_errado','ilegivel','pendente')),
  check_qtd         boolean,   -- NULL = sem base pra conferir
  check_periodo     boolean,
  read_packages     integer,   -- o que a leitora entendeu do print
  read_start_date   date,
  read_end_date     date,
  expected_packages integer,   -- o que a planilha dizia NA HORA (o painel compara com o de hoje e avisa se mudou)
  check_details     jsonb,
  checked_at        timestamptz,

  -- ---- FILA de reconferencia (pedido do Victor, 04/08: "se ela cair fica em fila
  -- esperando ela voltar ou ser validada manualmente") ----
  -- A cota do plano gratuito e de 20 leituras/dia POR MODELO. Numa leva de ~89
  -- drivers a cota pode acabar no meio: quem sobrar fica check_status='pendente'
  -- e volta pra fila em vez de virar trabalho manual.
  check_attempts    integer NOT NULL DEFAULT 0 CHECK (check_attempts >= 0),
  -- Quando tentar de novo (espera crescente). NULL = fora da fila: ou ja conferiu,
  -- ou desistiu, ou um humano resolveu na mao.
  next_check_at     timestamptz
);

-- ---------- 2. INDICES (idx_<tabela>_<coluna>; toda FK indexada) ----------
CREATE INDEX IF NOT EXISTS idx_driverpay_proofreq_company   ON public.driverpay_proof_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofreq_period    ON public.driverpay_proof_requests(period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofreq_by        ON public.driverpay_proof_requests(requested_by);

CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_company     ON public.driverpay_delivery_proofs(company_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_driver      ON public.driverpay_delivery_proofs(driver_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_period      ON public.driverpay_delivery_proofs(period_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_payment     ON public.driverpay_delivery_proofs(payment_id);
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_validated_by ON public.driverpay_delivery_proofs(validated_by);
-- Consulta quente: "o que falta deste driver nesta quinzena nesta plataforma".
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_slot        ON public.driverpay_delivery_proofs(period_id, driver_id, platform_name);
-- Achar print repetido entre drivers.
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_sha         ON public.driverpay_delivery_proofs(company_id, period_id, file_sha256);
-- A FILA: "quem esta esperando reconferencia e ja pode tentar de novo". Indice
-- parcial — so as linhas da fila entram, entao ele fica minusculo e rapido mesmo
-- com a tabela cheia de prints ja conferidos.
CREATE INDEX IF NOT EXISTS idx_driverpay_proofs_fila
  ON public.driverpay_delivery_proofs(next_check_at)
  WHERE next_check_at IS NOT NULL;

-- ---------- 3. RLS (mesma policy do modulo: empresa + mestre 9999/2626) ----------
DO $rls$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['driverpay_proof_requests','driverpay_delivery_proofs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS driverpay_rls ON public.%I;', t);
    EXECUTE format($p$CREATE POLICY driverpay_rls ON public.%I FOR ALL TO authenticated
      USING (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
      WITH CHECK (((company_id)::text = COALESCE((SELECT auth.jwt() ->> 'company_id'), '')) OR ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));$p$, t);
  END LOOP;
END $rls$;

-- ---------- 4. STORAGE: bucket privado dos prints ----------
-- PRIVADO: o print mostra codigos de rastreio e horarios de entrega. Driver sobe
-- pela edge fn (service_role) e NUNCA le de volta; painel (2626/9999) le/baixa por
-- signed URL. Sem policy anon. Mesmo desenho do bucket das notas fiscais.
INSERT INTO storage.buckets (id, name, public)
VALUES ('driverpay-delivery-proofs', 'driverpay-delivery-proofs', false)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS driverpay_proofs_master_all ON storage.objects;
CREATE POLICY driverpay_proofs_master_all ON storage.objects FOR ALL TO authenticated
  USING (bucket_id = 'driverpay-delivery-proofs' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')))
  WITH CHECK (bucket_id = 'driverpay-delivery-proofs' AND ((SELECT auth.jwt() ->> 'sub') IN ('9999','2626')));

-- ---------- 5. CONFIGURACAO POR EMPRESA (aditivo em driverpay_settings) ----------
-- Sem linha na tabela = padrao (auto ligado, tolerancia 0) — mesma regra do
-- nf_auto_validate, que ja mora aqui.
ALTER TABLE public.driverpay_settings
  ADD COLUMN IF NOT EXISTS proof_auto_confirm boolean NOT NULL DEFAULT true,
  -- Victor escolheu "bater EXATO" (0) em 04/08. A coluna existe desde ja pra que
  -- afrouxar a regra depois seja um clique no painel, e nao mais uma migration em
  -- producao — que e a operacao mais arriscada que a gente faz.
  ADD COLUMN IF NOT EXISTS proof_tolerance_packages integer NOT NULL DEFAULT 0 CHECK (proof_tolerance_packages >= 0);

-- ---------- 6. COMMENTS ----------
COMMENT ON TABLE public.driverpay_proof_requests IS
  'Espelho do app: a "torneira". Sem linha aqui pra (empresa,quinzena,plataforma), o portal do driver nao pede print nenhum. Gravada pelo botao "Solicitar espelho".';
COMMENT ON TABLE public.driverpay_delivery_proofs IS
  'Espelho do app: prints da tela da Shopee enviados pelo driver/lider (ou pelo operador via painel), ja com o resultado da conferencia automatica. Arquivos no bucket privado driverpay-delivery-proofs.';
COMMENT ON COLUMN public.driverpay_delivery_proofs.driver_id IS
  'De QUEM e o print. Num grupo o lider envia (uploaded_by), mas cada print e de um membro — e o pagamento do membro que fica verde.';
COMMENT ON COLUMN public.driverpay_delivery_proofs.file_sha256 IS
  'Impressao digital do arquivo. O app da Shopee nao mostra o nome do driver na tela, entao o sistema nao sabe de quem e a foto: se o mesmo arquivo aparecer em dois drivers, o painel AVISA (nao trava).';
COMMENT ON COLUMN public.driverpay_delivery_proofs.expected_packages IS
  'Quantos pacotes a planilha dizia no momento da conferencia. O painel compara com o esperado de HOJE e avisa quando a planilha mudou depois.';
COMMENT ON COLUMN public.driverpay_delivery_proofs.next_check_at IS
  'FILA de reconferencia: quando tentar ler de novo (a cota gratuita e de 20 leituras/dia por modelo, entao numa leva grande sobra gente). NULL = fora da fila (ja conferido, ou desistiu, ou resolvido na mao).';
COMMENT ON COLUMN public.driverpay_delivery_proofs.check_attempts IS
  'Quantas vezes ja tentamos ler este print. Alimenta a espera crescente entre tentativas e o limite pra desistir.';
COMMENT ON COLUMN public.driverpay_delivery_proofs.check_status IS
  'ok = bate tudo (autoriza marcar espelho conferido) | divergente = quantidade diferente, ACEITA e mostra so no painel | periodo_errado e ilegivel = RECUSADO na hora, driver reenvia | pendente = falha nossa na leitura, conferir na mao.';
COMMENT ON COLUMN public.driverpay_settings.proof_auto_confirm IS
  'Espelho do app: marcar "espelho conferido" sozinho quando o print bate. Desligado, a conferencia e a recusa continuam iguais — so o clique final fica com o operador.';
COMMENT ON COLUMN public.driverpay_settings.proof_tolerance_packages IS
  'Espelho do app: folga aceita na quantidade de pacotes. 0 = tem que bater exato (decisao do Victor, 04/08).';

-- ============================================================================
-- ROLLBACK (se precisar):
--   ALTER TABLE public.driverpay_settings DROP COLUMN IF EXISTS proof_tolerance_packages;
--   ALTER TABLE public.driverpay_settings DROP COLUMN IF EXISTS proof_auto_confirm;
--   DROP POLICY IF EXISTS driverpay_proofs_master_all ON storage.objects;
--   DELETE FROM storage.buckets WHERE id = 'driverpay-delivery-proofs';   -- (esvaziar objetos antes)
--   DROP TABLE IF EXISTS public.driverpay_delivery_proofs CASCADE;
--   DROP TABLE IF EXISTS public.driverpay_proof_requests CASCADE;
-- ============================================================================
