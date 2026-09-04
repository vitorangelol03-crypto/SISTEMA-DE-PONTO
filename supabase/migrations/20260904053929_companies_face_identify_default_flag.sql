-- 04/09/2026 — Chave por empresa do "ponto SÓ pela facial, sem digitar CPF".
--
-- Pedido do Victor: a tela de bater ponto abre direto na câmera (reconhecimento
-- 1:N, sem CPF) — o CPF+senha vira só a alternativa manual, sempre disponível.
--
-- Deliberadamente uma chave NOVA e SEPARADA de `face_recognition_config.enabled`
-- (o toggle que já liga a verificação facial 1:1 de hoje, ligado na Caratinga
-- desde antes desta feature existir). Amarrar no toggle existente faria a tela
-- virar câmera-primeiro da noite pro dia pra quem já bate ponto hoje, sem eu ter
-- combinado essa data com o Victor — e quebraria a suíte de testes inteira que
-- assume CPF como padrão. NASCE false: comportamento de hoje intacto até ele
-- decidir ligar, empresa por empresa.
--
-- Ligar depois = UPDATE companies SET face_identify_default = true WHERE id = <empresa>.

ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS face_identify_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.companies.face_identify_default IS
  'Ponto sem CPF: quando true, a tela de bater ponto abre direto no reconhecimento facial (1:N) em vez de pedir CPF — CPF+senha vira alternativa manual sempre disponível. Padrão false = comportamento legado (CPF primeiro). Separado de face_recognition_config.enabled de propósito (ver comentário da migration).';
