# 00-INDEX — Índice mestre dos checkpoints (LER PRIMEIRO ao abrir o projeto)

> Regra de leitura: **este índice + o último checkpoint de sessão** bastam para retomar.
> Só abra os outros arquivos quando o assunto pedir (a tabela diz qual).
> Última atualização: **2026-07-19**.

## 🎯 Estado atual (1 parágrafo)

**Sessão noite 20/07 (bugs de produção do ponto):** facial da Caratinga estava
DESLIGADA desde 19/07 02:24 (spec 24 interrompido) → religada + spec blindado;
Pablo sem GPS (bug `error` vs `message` corrigido); "saída sozinha" 12-13s =
defeito de UX histórico — 2 registros limpos com backup (Diendrel + João Pedro)
e **features de proteção ENTREGUES** (decisões do Victor): confirmação de saída
< 10 min, auto-retorno ao CPF em 35s, overlay de GPS bloqueado sem gastar
tentativa — **validadas com CLIQUES REAIS** (spec 62 novo, 3/3 chromium).
CAUSA RAIZ verdadeira da facial desligada era o spec 23 (update global sem
restauração) — corrigido; facial conferida ENABLED pós-baterias. `main` local =
`cf2636e` (5 commits não pushados). Validação: tsc 0, suite 36/36 arquivos
569 ✅, build ✓, specs 23 e 62 verdes.
Driverpay em produção segue como na sessão da manhã (espelhos com valor separado
+ multi-rota; eMile ligada; Tales unificado).
Último checkpoint: `CHECKPOINT_SESSAO_2026-07-20-noite.md`.

## 📚 Mapa dos checkpoints

| Arquivo | O que cobre | Status |
|---|---|---|
| `CHECKPOINT_SESSAO_2026-07-20-noite.md` | **Mais recente.** Bugs de prod do ponto: facial desligada por spec (religada+blindada), Pablo sem GPS (fix msg), saída fantasma 12s = UX (2 registros limpos c/ backup); pendências de feature | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-20.md` | Valor separado por plataforma + multi-rota sem taxa média + fix race do corte; specs 61/unit novos | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-18.md` | Grupos: vínculo exclusivo + busca por rota; retroativo dos 17 commits de melhorias do painel (17-18/07) | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-19.md` | Madrugada autônoma: F8 concluída, 4 features dos espelhos entregues, aprendizados de infra (Vite WSL!) | 🟢 ATIVO |
| `PLANO_ESPELHOS_2026-07-19.md` | Plano completo das 4 implementações dos espelhos (riscos, mitigação, ordem) | 🟢 ATIVO (fila aprovada) |
| `CHECKPOINT_IMPORT_PLANILHAS.md` | Importação automática iMile/Shopee/Anjun (SF1-SF6): formatos, decisões, o que falta validar com clique real | 🟢 ATIVO |
| `CHECKPOINT_SESSAO_2026-07-04_fix-bug1-multirota.md` | Auditoria 7 dimensões do driverpay + fix Bug #1 (rota-fantasma) e #2 (taxa por rota) + pendências de segurança | 🟢 ATIVO (pendências valem) |
| `CHECKPOINT_SESSAO_2026-07-04.md` | Driverpay: nota fiscal, taxa por rota, Zapex, desconto com provas | 🟡 histórico |
| `CHECKPOINT_SESSAO_2026-07-03.md` | Nascimento da aba Pagamentos Driver (banco→UI→PDF→testes) | 🟡 histórico |
| `CHECKPOINT_SESSAO_2026-06-27.md` | Mestre 2626 + edição de ponto exclusiva do 2626 (frontend+RLS+trigger) | 🟢 ATIVO (regra vigente) |
| `CHECKPOINT_SESSAO_2026-05-29.md` | Backup completo de prod + refutação do "bug" de desconto de erros | 🟡 histórico |
| `CHECKPOINT_REVISAO_2026-05-27.md` | Revisão empírica integral do sistema (achados com fonte) | 🟡 histórico |
| `CHECKPOINT.md` | Índice mestre ANTIGO do sistema de ponto (regras 1-8, fases, auth) | 🟡 histórico — parou em 04/07; regras 1-8 continuam valendo |
| `CHECKPOINT_ARQUITETURA.md` | Stack, padrões, decisões D1-D7 | 🔵 referência (05/2026) |
| `CHECKPOINT_BANCO.md` | Schema, RLS, edge fns, RPCs do sistema de ponto | 🔵 referência (05/2026 — driverpay NÃO está aqui) |
| `CHECKPOINT_TESTES.md` | Specs, coverage, comandos de teste | 🔵 referência (05/2026 — specs 52-56 não listados) |
| `CHECKPOINT_OPERACAO.md` | Deploy, env vars, troubleshoot | 🔵 referência (05/2026) |
| `CHECKPOINT_FASES.md` | Histórico granular fases 5→14 | ⚪ arquivo morto (consulta rara) |
| `CHECKPOINT_PROXIMOS_PASSOS.md` | Pendências go-live + roadmap (APK Capacitor etc.) | ⚪ superseded em 05/2026 — go-live JÁ aconteceu; só o roadmap §7 ainda interessa |

## ⚖️ Decisões ativas (não re-perguntar)

- **Ponto:** editar/excluir ponto é SÓ do mestre **2626** (nem 9999); travado em frontend + RLS + trigger.
- **Driverpay:** namespace `driverpay_*`; 100% aditivo ao sistema de ponto; vários períodos abertos permitidos; import auto-detecta plataforma pelo cabeçalho; valor/pacote vem da taxa cadastrada (nunca da planilha); apelidos de entregador aprendidos em `driverpay_driver_aliases`; Shopee COLETA = plataforma "Coleta Shopee"; plataforma arquivada sai da soma; driver só pode estar em 1 grupo (vínculo exclusivo, 18/07).
- **Git:** commit local sempre; **push é do Victor, na mão**; Conventional Commits.
- **Espelhos (19/07):** destaque+aviso por plataforma com REGRA DE PRESENÇA (só onde há pacotes); aviso acoplado ao destaque; corte auto-salvo por empresa; descontos no grupo limite 12.
- **Espelhos (20/07):** valor separado por plataforma FORA do total exibido (acoplado ao destaque; texto explícito pro driver leigo; a TELA do painel segue com total cheio — decisão do Victor); multi-rota = uma linha POR ROTA com a taxa real, NUNCA média; `packagesForPlatform` soma linhas.
- **E2E (20/07):** nunca rodar tsc/vitest/build em paralelo com bateria Playwright (carga WSL = flake); aquecer o Vite (curl / + /src/main.tsx) antes de spec com server frio.
- **Testes (19/07):** retry 1× local (flake de carga vira 'flaky' visível); Vite WSL exige RESTART após editar código; hooks lentos precisam test.setTimeout interno; specs driverpay rodam com `--project=chromium` (firefox/webkit sem binário e mobile não serve pra tabela desktop).
- **PDF (19/07):** separação entre trechos de texto com estilos diferentes é por GAP DE POSIÇÃO (`padLeft`), nunca espaço-caractere — o visualizador engole o espaço ao substituir a Helvetica; prints de aprovação ficam em `prints-espelhos/` na raiz (gitignored).
- **Dados de prod (20/07):** eMile Caratinga com valor separado LIGADO (destaque + aviso CNPJ + separação); cadastros duplicados do Tales (Inhapim) UNIFICADOS no "TALES ALEXANDRE DE SOUSA" — duplicado desativado com nota, alias reapontado. Não recriar o duplicado.
- **Checkpoints (18/07):** todos vivem em `.claude-checkpoints/`; 1 checkpoint por sessão; atualizar este índice junto; hook pós-commit lembra a sessão de manter isso em dia.
- **Ponto/testes (20/07 noite):** spec que toca config REAL de prod (ex.: toggle facial) tem que restaurar em `finally`; bateria E2E só em janela segura (nunca de noite — turno da madrugada bate ~02:00); recusa de ponto da edge fn vem em `message` (não `error`); correção de registro de ponto = sempre backup antes (`backups/`).
- **Tela de ponto (20/07 noite, decisões do Victor):** saída < 10 min da marcação anterior = confirmação obrigatória; tela volta ao CPF 35s após registrar; GPS bloqueado = instruir sem chamar servidor; tentativa sem GPS que CHEGA no servidor continua criando bonus_block (regra mantida).

## ⚠️ Áreas frágeis / pendências abertas

- 🟠 **Segurança driverpay:** exclusividade "2626" é client-side; RLS = `company_id OR sub IN (9999,2626)`; RPCs sem authz do chamador.
- 🟡 Bucket `driverpay-discount-proofs` público; sem trava server-side de `driverpay_periods`; `driverPayCalc.ts` sem termo Zapex.
- 🟡 Import com arquivos REAIS grandes nunca clicado até o fim (Shopee 132k só até a prévia; iMile 13k/Anjun 8k só fixtures).
- 🟡 tsc com 63 erros de baseline (fora do driverpay); `*.tsbuildinfo` fora do `.gitignore`.
- 🔵 Ponte Nova: aba driverpay existe mas dados zerados (só Caratinga populada).
