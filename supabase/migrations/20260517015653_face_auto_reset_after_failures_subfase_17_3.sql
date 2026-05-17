-- Sub-fase 17.3: reset facial automático após N falhas em janela de tempo.
-- Adiciona 2 colunas config + trigger BEFORE INSERT em face_auth_attempts
-- que detecta acumulação de falhas e marca employee.face_reset_requested=true.
--
-- Defaults razoáveis: 5 falhas em 60 minutos.
-- Admin pode ajustar via UPDATE face_recognition_config SET max_attempts_before_reset=N WHERE company_id=...

ALTER TABLE public.face_recognition_config
  ADD COLUMN IF NOT EXISTS max_attempts_before_reset INTEGER NOT NULL DEFAULT 5,
  ADD COLUMN IF NOT EXISTS attempts_window_minutes INTEGER NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.face_recognition_config.max_attempts_before_reset IS
  'Sub-fase 17.3: número máx de falhas faciais antes de auto-reset (face_reset_requested=true). Default 5.';
COMMENT ON COLUMN public.face_recognition_config.attempts_window_minutes IS
  'Sub-fase 17.3: janela de tempo (minutos) pra contar falhas. Default 60.';

-- Trigger: após INSERT em face_auth_attempts com success=false,
-- conta falhas recentes desse employee na janela. Se >= max, marca reset.
-- (Versão atualizada em sub-fase 17.3.2: guard threshold=0)
CREATE OR REPLACE FUNCTION public._check_face_auto_reset()
RETURNS TRIGGER AS $$
DECLARE
  cfg RECORD;
  recent_failures INTEGER;
BEGIN
  IF NEW.success IS NOT FALSE THEN
    RETURN NEW;
  END IF;

  SELECT max_attempts_before_reset, attempts_window_minutes
  INTO cfg
  FROM public.face_recognition_config
  WHERE company_id = NEW.company_id
  LIMIT 1;

  IF cfg IS NULL OR cfg.max_attempts_before_reset IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT count(*)
  INTO recent_failures
  FROM public.face_auth_attempts
  WHERE employee_id = NEW.employee_id
    AND success = FALSE
    AND attempted_at >= (NOW() - (cfg.attempts_window_minutes || ' minutes')::INTERVAL);

  IF recent_failures >= cfg.max_attempts_before_reset THEN
    UPDATE public.employees
       SET face_reset_requested = TRUE
     WHERE id = NEW.employee_id
       AND COALESCE(face_reset_requested, FALSE) = FALSE;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

COMMENT ON FUNCTION public._check_face_auto_reset() IS
  'Sub-fase 17.3: trigger AFTER INSERT face_auth_attempts. Conta falhas recentes do employee e marca face_reset_requested=true se atingir config.max_attempts_before_reset na janela attempts_window_minutes.';

DROP TRIGGER IF EXISTS trg_face_auto_reset ON public.face_auth_attempts;
CREATE TRIGGER trg_face_auto_reset
  AFTER INSERT ON public.face_auth_attempts
  FOR EACH ROW
  EXECUTE FUNCTION public._check_face_auto_reset();
