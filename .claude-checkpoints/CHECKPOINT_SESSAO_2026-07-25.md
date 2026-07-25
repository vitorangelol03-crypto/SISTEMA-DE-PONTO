# CHECKPOINT SESSÃO — 2026-07-25 (driver sem login · botão de reset NUNCA funcionou · RPC)

> Sessão de suporte de produção: driver Caio sem conseguir logar no app → investigação
> empírica achou DOIS problemas independentes; o segundo virou o fix `398befc`.

## O caso (relato do Victor)

Driver **CAIO REZENDE VALERIO NASCIMENTO** "caiu" do app e não conseguia logar de novo
("credenciais inválidas"); Victor resetou a senha pelo painel e não resolveu. CPF que ele
digita foi confirmado como o correto (131.688.696-43, o mesmo do cadastro).

## Problema 1 — botão "Resetar senha" do painel NUNCA funcionou (nenhum driver)

- **Causa raiz (provada em prod):** no Postgres, `DELETE ... WHERE driver_id=X` numa tabela
  com RLS exige que as linhas também passem pelas **policies de SELECT**. A
  `driverpay_driver_auth` não tem policy de SELECT **de propósito** (protege os hashes) →
  o DELETE do painel casava **0 linhas em silêncio** e o toast dizia "sucesso".
- **Prova:** simulando o JWT do painel (role authenticated + sub 2626): delete COM WHERE = 0
  linhas; delete SEM WHERE (não referencia coluna) = 37 linhas (rollback proposital).
  Policy avaliava TRUE, grants ok, sem triggers — era só a regra SELECT-visibility.
- **Fix (commit `398befc` + migration `20260725100000` APLICADA em prod):** RPC
  `driverpay_reset_driver_password(p_driver_id)` SECURITY DEFINER: checa authz do chamador
  (mestre 9999/2626 OU mesma empresa do driver), apaga por dentro, devolve nº de linhas.
  Policy de DELETE morta removida (deixá-la convidaria a "consertar" com policy de SELECT,
  expondo hashes). Painel diferencia "senha resetada" (>0) de "nunca acessou o app" (0).
- **Validação:** RPC testada NA BASE REAL simulando o JWT (2626 apaga=1; repetida=0; mesma
  empresa ok; empresa errada nega; anon sem EXECUTE) · tsc 0 · build ok · 606 unit verdes.
  Vizinhança conferida: `driverpay_mirror_publications` tem policy ALL (inclui SELECT) →
  o "despublicar" NÃO sofre do mesmo mal; a armadilha era só na tabela de senhas.

## Problema 2 — o que trava o Caio NÃO é senha

- Cadastro do Caio **intocado desde 24/07 11:40 BRT** (último login COM SUCESSO, com senha
  própria criada às 08:06). **Zero tentativas erradas registradas** — tentativa com senha
  errada incrementa `failed_attempts`; nada incrementou. CPF confirmado certo pelo Victor →
  as tentativas dele **não estão chegando no servidor** (celular sem internet real, página
  velha em cache, etc.). Nenhum bloqueio/lockout ativo; sem CPF duplicado; edge fn v7 ok.
- **Feito:** reset REAL do Caio direto no banco (a pedido/intenção do Victor) com backup
  antes → tabela `backup_driver_auth_20260725`. **Caio entra com CPF + 1234** (troca
  obrigatória). Se ainda falhar: aba anônima / conferir internet e mandar a mensagem EXATA.
- Nota: cadastro do Caio foi editado 24/07 22:35 BRT (não mudou o CPF — igual ao import de
  23/07; provavelmente PIX/rota). Registrado só como contexto.

## Pendências

- **Caio confirmar o login** com 1234 (se falhar → problema é no aparelho; pedir print).
- ~~Push + deploy Vercel~~ **FEITO na própria sessão**: Victor pushou via `!` (main
  `874c899..1c12f60`), deploy Vercel conferido no ar (chunk `DriverPayTab-9KO0wAqe.js`
  com a RPC + toast novo; bundle principal `index-Br4-F-oD`). Botão de reset 100% no ar.
- Apagar `backup_driver_auth_20260725` (+ `backup_mirror_pub_20260724` e
  `backup_driver_pix_20260724` da sessão anterior) quando Victor confirmar.
- Herdadas: recebedor Mutum (Gustavo × João Victor); PIX othon/Pablo Raspante; 6 CPFs
  faltantes; painel responsivo adiado.
