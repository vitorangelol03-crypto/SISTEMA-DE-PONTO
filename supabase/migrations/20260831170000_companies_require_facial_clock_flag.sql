-- 31/08/2026 — Chave por empresa da "trava dura" do ponto (facial + geo obrigatórios).
--
-- Roadmap item 1 (decisões do Victor 31/08): blindar o fluxo de hoje —
--   quando LIGADA para uma empresa, o servidor (edge fn clock-in-validated) passa a:
--     · exigir que o rosto do momento confira com o rosto cadastrado (1:1), em TODAS as batidas;
--     · bloquear GPS fora da área em TODAS as batidas (hoje só a 1ª);
--     · na 1ª vez de quem ainda não tem rosto, cadastrar o rosto na hora (uma vez).
--   DESLIGADA (padrão) = comportamento idêntico ao de hoje (nada muda).
--
-- Rollout: empresa por empresa, só depois que todo mundo daquela empresa tiver rosto
-- (Ponte Nova quase pronta: 1 sem rosto; Caratinga: 32 sem rosto). Por isso NASCE false.
-- Ligar depois = UPDATE companies SET require_facial_clock = true WHERE id = <empresa> (só o 2626/admin).

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS require_facial_clock boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.require_facial_clock IS
  'Trava dura do ponto: quando true, o servidor exige facial (1:1) + geo válida em TODAS as batidas e cadastra o rosto na 1ª vez. Padrão false = comportamento legado. Ligar empresa por empresa após todos terem rosto (item 1 do roadmap, 31/08/2026).';
