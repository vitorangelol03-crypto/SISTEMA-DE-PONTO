-- ═══════════════════════════════════════════════════════════════════════════════
-- §2.2 LEVA 2 (pedido do Victor, 08/09/2026) — continuação de 20260908120000.
--
-- A leva 1 trocou as 24 policies das tabelas por "segue a permissão da tela". Sobraram
-- DOIS caminhos de acesso que ainda ignoravam a permissão:
--
--   (a) As funções `*_masked` do driverpay (SECURITY DEFINER, EXECUTE pro `authenticated`)
--       tinham gate próprio: "mesma empresa OU sub in (9999,2626)". Ou seja, um usuário
--       de Caratinga SEM a aba liberada continuava lendo tudo por elas — a porta da leva 1
--       estava fechada, esta aqui não.
--   (b) As 6 policies de Storage estavam presas em `sub IN ('9999','2626')`. Efeito
--       colateral do desenho antigo: quem o Victor liberasse na tela HOJE não conseguiria
--       anexar foto de desconto nem ver nota fiscal/espelho — e o erro do Storage some em
--       silêncio na tela.
--
-- ESCOPO — só as 12 funções `*_masked` DO DRIVERPAY. As outras 7 (`get_payments_masked`,
-- `get_error_records_masked`, `get_bonus_removals_masked`, `get_triage_errors_masked`,
-- `get_triage_distribution_employees_masked`, `upsert_payment_bonus_masked`,
-- `upsert_payment_rate_masked`) são do Financeiro/Erros/Triagem: exigir permissão de
-- driverpay nelas QUEBRARIA esses módulos. Ficam intocadas — não foram pedidas.
--
-- A máscara de valores (`driverpay.viewValues`, de 03-04/09) fica INTACTA: o que muda é
-- só o gate de acesso, não o `can_view` que decide se o R$ aparece.
--
-- PROVADO em transação com rollback, antes de aplicar:
--   2626 ............................ 5 plataformas, 132 pagamentos
--   9999 ............................ 5 plataformas, 132 pagamentos
--   02 (supervisor, sem a aba) ...... 0 e 0
--   8888 (Ponte Nova) em Caratinga .. 0 e 0
--   12/12 funções trocadas, 0 com número cravado, máscara de valor intacta.
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1) As 12 funções `*_masked` do driverpay passam a usar `driverpay_pode` ────────
-- Reescrita por substituição do gate, preservando o resto do corpo byte a byte: pega a
-- definição real do banco (pg_get_functiondef), troca só a expressão do gate e recria.
-- Assim nenhuma lógica de negócio é reescrita à mão — o risco de errar uma query grande
-- ao copiar some. Se o gate não for encontrado em alguma, a migration ABORTA (não deixa
-- passar em silêncio uma função que continuaria aberta).
do $do$
declare
  r record;
  novo text;
  trocadas int := 0;
  padrao text := '\(\(([a-zA-Z_][a-zA-Z_0-9]*(?:\.[a-zA-Z_][a-zA-Z_0-9]*)?)::text = COALESCE\(\(auth\.jwt\(\) ->> ''company_id''\), ''''\)\) OR \(\(auth\.jwt\(\) ->> ''sub''\) = ANY \(ARRAY\[''9999'',''2626''\]\)\)\)';
begin
  for r in
    select p.oid, p.proname, pg_get_functiondef(p.oid) as def
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname like '%masked%'
      and pg_get_functiondef(p.oid) like '%driverpay%'
    order by p.proname
  loop
    novo := regexp_replace(r.def, padrao, 'public.driverpay_pode((\1)::uuid, ''view'')', 'g');
    if novo = r.def then
      raise exception 'gate nao encontrado em %s — abortando pra nao deixar funcao aberta', r.proname;
    end if;
    execute novo;
    trocadas := trocadas + 1;
  end loop;

  if trocadas <> 12 then
    raise exception 'esperava trocar 12 funcoes do driverpay, troquei %', trocadas;
  end if;
end $do$;

-- ── 2) Storage: as 6 policies do driverpay seguem a mesma regra ───────────────────
-- O caminho de todo arquivo começa com o company_id (conferido nos 4 buckets:
-- `<company_id>/<...>`), então a empresa sai de `split_part(name, '/', 1)`. Sem cast pra
-- uuid de propósito: caminho fora do padrão não pode derrubar a policy com erro de cast.
do $do$
declare
  b record;
  v_regra text := '((select public.driverpay_acesso_total())'
               || ' or ((select public.driverpay_tem_aba())'
               || '     and split_part(name, ''/'', 1) = coalesce((select auth.jwt() ->> ''company_id''), '''')))';
begin
  for b in
    select * from (values
      ('driverpay_mirrors_master_all', 'driverpay-mirrors',         'all'),
      ('driverpay_nf_master_all',      'driverpay-nota-fiscais',    'all'),
      ('driverpay_proofs_master_all',  'driverpay-delivery-proofs', 'all'),
      ('driverpay_proof_select',       'driverpay-discount-proofs', 'select'),
      ('driverpay_proof_insert',       'driverpay-discount-proofs', 'insert'),
      ('driverpay_proof_delete',       'driverpay-discount-proofs', 'delete')
    ) as t(nome, bucket, cmd)
  loop
    execute format('drop policy if exists %I on storage.objects', b.nome);
    if b.cmd = 'insert' then
      -- INSERT só aceita WITH CHECK
      execute format(
        'create policy %I on storage.objects for insert to authenticated with check (bucket_id = %L and %s)',
        b.nome, b.bucket, v_regra);
    elsif b.cmd = 'all' then
      execute format(
        'create policy %I on storage.objects for all to authenticated using (bucket_id = %L and %s) with check (bucket_id = %L and %s)',
        b.nome, b.bucket, v_regra, b.bucket, v_regra);
    else
      -- SELECT e DELETE só aceitam USING
      execute format(
        'create policy %I on storage.objects for %s to authenticated using (bucket_id = %L and %s)',
        b.nome, b.cmd, b.bucket, v_regra);
    end if;
  end loop;
end $do$;

-- ── 3) Tira a permissão do anônimo no bucket `spreadsheets` ───────────────────────
-- `anon_spreadsheets_all` dava ALL (ler, subir E apagar) pro `anon` — a chave pública que
-- está dentro do site. Conferido antes de remover: o bucket está VAZIO (0 arquivos) e a
-- string 'spreadsheets' não aparece em nenhum lugar de src/, supabase/functions/ ou
-- scripts/. Ninguém usa; era só porta aberta.
drop policy if exists anon_spreadsheets_all on storage.objects;
