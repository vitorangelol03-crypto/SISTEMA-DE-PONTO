-- Fase A do rework de Usuários (01/09/2026, pedido do Victor): cadastro completo
-- (nome, telefone) + botão de redefinir senha padrão, com troca obrigatória no
-- próximo login. Aditivo: colunas opcionais / com default, nenhum usuário
-- existente muda de comportamento até alguém editar ou redefinir a senha dele.
alter table public.users
  add column if not exists name text,
  add column if not exists phone text,
  add column if not exists must_change_password boolean not null default false;

comment on column public.users.name is 'Nome completo do usuário (opcional, cadastro anterior a 01/09/2026 fica em branco até editarem).';
comment on column public.users.phone is 'Telefone de contato do usuário (opcional).';
comment on column public.users.must_change_password is 'true logo após "Redefinir senha" (senha padrão) até o usuário trocar por uma própria no próximo login.';
