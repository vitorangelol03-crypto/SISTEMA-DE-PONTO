-- 2026-06-27 — Reforço server-side: SOMENTE o mestre '2626' (ou roles de backend)
-- pode ALTERAR data/horário de ponto ou EXCLUIR/RESETAR registros de ponto.
--
-- Contexto:
--   * Funcionários batem ponto via edge fn clock-in-validated, que escreve com
--     SUPABASE_SERVICE_ROLE_KEY -> current_user='service_role' -> LIBERADO (bypass).
--   * Supervisores/admins continuam marcando presente/falta, aprovando/rejeitando e
--     recalculando (essas operações não tocam colunas de horário) -> LIBERADO.
--   * Editar horário (markAttendance exit_time / setManualTime) e resetar (deleteAttendance)
--     por qualquer um != 2626 -> BLOQUEADO. O 9999 também perde editar/resetar ponto.
--
-- SECURITY INVOKER (default): current_user reflete o role real do chamador (PostgREST
-- faz SET ROLE a partir do JWT verificado). O 'sub' vem de request.jwt.claims, setado
-- pelo PostgREST a partir do JWT assinado com JWT_SECRET -> não forjável.
--
-- Aplicada via MCP apply_migration (name: attendance_ponto_master_only_trigger).
-- Verificação real (ROLLBACK txns): service_role/2626 PASSAM; 01/9999 BLOQUEADOS em
-- alterar horário, INSERT com horário e DELETE; supervisor marca status/recalc PASSA.
-- Rollback de emergência: DROP TRIGGER trg_enforce_ponto_master_only ON public.attendance;
CREATE OR REPLACE FUNCTION public.enforce_ponto_master_only()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''  -- evita injeção via search_path (advisor 0011); função não acessa tabelas
AS $fn$
DECLARE
  v_sub text;
  v_changed boolean := false;
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

  -- 4) INSERT/UPDATE: bloqueia qualquer alteração de data/horário de ponto.
  IF TG_OP = 'INSERT' THEN
    v_changed := NEW.entry_time IS NOT NULL
              OR NEW.exit_time IS NOT NULL
              OR NEW.exit_time_full IS NOT NULL
              OR NEW.entry_1_time IS NOT NULL
              OR NEW.exit_1_time IS NOT NULL
              OR NEW.entry_2_time IS NOT NULL
              OR NEW.exit_2_time IS NOT NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_changed := NEW.entry_time     IS DISTINCT FROM OLD.entry_time
              OR NEW.exit_time      IS DISTINCT FROM OLD.exit_time
              OR NEW.exit_time_full IS DISTINCT FROM OLD.exit_time_full
              OR NEW.entry_1_time   IS DISTINCT FROM OLD.entry_1_time
              OR NEW.exit_1_time    IS DISTINCT FROM OLD.exit_1_time
              OR NEW.entry_2_time   IS DISTINCT FROM OLD.entry_2_time
              OR NEW.exit_2_time    IS DISTINCT FROM OLD.exit_2_time
              OR NEW.date           IS DISTINCT FROM OLD.date;
  END IF;

  IF v_changed THEN
    RAISE EXCEPTION 'Apenas o usuario mestre (2626) pode alterar data/horario de ponto';
  END IF;

  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_enforce_ponto_master_only ON public.attendance;
CREATE TRIGGER trg_enforce_ponto_master_only
  BEFORE INSERT OR UPDATE OR DELETE ON public.attendance
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ponto_master_only();
