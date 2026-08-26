-- Sub-fase: cadastro público de novo funcionário (link sem login) + aba de
-- aprovação de cadastro (análise de antecedentes).
--
-- Contexto (pedido do Victor, 26/08): link público pra cadastrar funcionário
-- novo (nome, CPF, telefone, PIX) sem entrar no sistema. Todo funcionário
-- (os que já existem E os novos) fica "pending" até alguém analisar. Enquanto
-- pending/approved ele bate ponto normal — só "rejected" bloqueia.
--
-- Aditivo: colunas novas, nullable ou com DEFAULT, não quebra nada que já
-- existe. registration_status entra com DEFAULT 'pending', então os 97
-- funcionários já cadastrados ficam "pending" automaticamente.

ALTER TABLE public.employees
  ADD COLUMN phone text,
  ADD COLUMN registration_status text NOT NULL DEFAULT 'pending'
    CHECK (registration_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN registration_notes text,
  ADD COLUMN registration_reviewed_by text REFERENCES public.users(id),
  ADD COLUMN registration_reviewed_at timestamptz;

COMMENT ON COLUMN public.employees.registration_status IS
  'Análise de antecedentes do cadastro. pending/approved = bate ponto normal. rejected = bloqueado no /clock.';
