-- Sub-fase 17.3.2 fix bug: threshold=0 deveria DESLIGAR auto-reset, mas
-- condição `recent_failures >= 0` é sempre true. Adicionar guard explícito.

CREATE OR REPLACE FUNCTION public._check_face_auto_reset()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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

  -- Sub-fase 17.3.2: max_attempts = 0 OU NULL desliga auto-reset
  IF cfg IS NULL OR cfg.max_attempts_before_reset IS NULL OR cfg.max_attempts_before_reset <= 0 THEN
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
$$;
