-- 2026-08-13 — Fecha o último buraco: SOMENTE o mestre '2626' (ou roles de backend)
-- pode CRIAR registro de ponto ou mudar o status (presente/falta) de um existente.
--
-- Por que (incidente real, medido no banco):
--   Em 04/08/2026, às 14:53 e 14:55 (BRT), alguém logado com o mestre 9999 clicou no
--   botão verde "Presente" para 3 pessoas que NÃO trabalharam. O registro nasceu sem
--   batida nenhuma (entry_time NULL) — o gatilho de 27/06 deixava passar justamente
--   isso, porque só olhava data/horário. Na tela de Ponto o selo verde fica idêntico
--   ao de quem bateu ponto de verdade, e o Financeiro conta qualquer linha 'present'
--   como dia trabalhado: as 3 receberam R$ 150,00 de diária em 11/08.
--   Decisão do Victor (13/08): "bloqueia em todos os usuários, somente 2626 tem acesso
--   para editar, bater ponto e excluir".
--
-- O que NÃO muda (conferido antes de escrever):
--   * Funcionário batendo ponto na tela /clock: passa pela edge fn clock-in-validated,
--     que escreve com SUPABASE_SERVICE_ROLE_KEY -> current_user='service_role' -> LIBERADO.
--     Prova empírica: as 33 batidas de 13/08 nasceram com entry_time preenchido, coisa
--     que este mesmo gatilho já bloqueia desde 27/06 para quem não é 2626/backend.
--   * Aprovar / recusar / aprovar em lote: mexem só em approval_status -> LIBERADO.
--   * recalcAttendance (minutos, banco de horas): não toca status/data/horário -> LIBERADO.
--   * applyBonusToAllPresent: só LÊ attendance; escreve em payments/bonuses -> LIBERADO.
--
-- O que passa a ser bloqueado para quem não é 2626/backend:
--   * INSERT de qualquer registro de ponto (era o caminho do "Presente"/"Falta" e do
--     "Marcar como Presente" em massa);
--   * UPDATE que mude o status (present <-> absent) de um registro existente.
--
-- Rollback: reaplicar a versão de 20260627120100_attendance_ponto_master_only_trigger.sql
-- (a função é CREATE OR REPLACE; o gatilho em si não muda).
CREATE OR REPLACE FUNCTION public.enforce_ponto_master_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''  -- evita injeção via search_path (advisor 0011); função não acessa tabelas
AS $fn$
DECLARE
  v_sub text;
  v_time_changed boolean := false;
BEGIN
  -- 1) Roles de backend bypassam: service_role (clock-in/edge fns), postgres (migrations/admin), supabase_admin.
  IF current_user IN ('service_role', 'postgres', 'supabase_admin') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 2) Mestre autorizado a mexer em ponto.
  v_sub := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub';
  IF v_sub = '2626' THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- 3) Exclusão/reset de ponto é exclusivo do mestre/backend.
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Apenas o usuario mestre (2626) pode excluir/resetar registros de ponto';
  END IF;

  -- 4) Criar registro de ponto é exclusivo do mestre/backend (13/08/2026).
  --    Cobre marcar presente/falta pelo painel, com ou sem horário.
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Apenas o usuario mestre (2626) pode registrar ponto (presenca/falta)';
  END IF;

  -- 5) UPDATE: mudar de presente para falta (ou o contrário) também é registrar ponto.
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    RAISE EXCEPTION 'Apenas o usuario mestre (2626) pode alterar presenca/falta';
  END IF;

  -- 6) UPDATE: data/horário de ponto seguem exclusivos (regra de 27/06/2026).
  v_time_changed := NEW.entry_time     IS DISTINCT FROM OLD.entry_time
                 OR NEW.exit_time      IS DISTINCT FROM OLD.exit_time
                 OR NEW.exit_time_full IS DISTINCT FROM OLD.exit_time_full
                 OR NEW.entry_1_time   IS DISTINCT FROM OLD.entry_1_time
                 OR NEW.exit_1_time    IS DISTINCT FROM OLD.exit_1_time
                 OR NEW.entry_2_time   IS DISTINCT FROM OLD.entry_2_time
                 OR NEW.exit_2_time    IS DISTINCT FROM OLD.exit_2_time
                 OR NEW.date           IS DISTINCT FROM OLD.date;

  IF v_time_changed THEN
    RAISE EXCEPTION 'Apenas o usuario mestre (2626) pode alterar data/horario de ponto';
  END IF;

  RETURN NEW;
END;
$fn$;

-- Gatilho já existe desde 27/06 (BEFORE INSERT OR UPDATE OR DELETE). Recriado por
-- idempotência, caso esta migration rode num banco novo antes daquela.
DROP TRIGGER IF EXISTS trg_enforce_ponto_master_only ON public.attendance;
CREATE TRIGGER trg_enforce_ponto_master_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ponto_master_only();
