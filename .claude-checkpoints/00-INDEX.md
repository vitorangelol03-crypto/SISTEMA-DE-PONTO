# 00-INDEX — Índice mestre dos checkpoints (LER PRIMEIRO ao abrir o projeto)

> Regra de leitura: **este índice + o último checkpoint de sessão** bastam para retomar.
> Só abra os outros arquivos quando o assunto pedir (a tabela diz qual).
> Última atualização: **2026-07-18**.

## 🎯 Estado atual (1 parágrafo)

**Aba Pagamentos Driver EM PRODUÇÃO desde 18/07** (deploy Vercel; Victor operando com dados
reais — Quinzena Junho em uso ativo). `main` = `af62879`: fix da sessão expirada (mensagem
clara no lugar do toast genérico) + feature **Espelhos da seleção** (marcar grupos/drivers e
gerar só eles). Pendentes: merge da branch `chore/deps-minor-patch` (Dependabot validado,
falta OK do Victor) e Victor colar a SERVICE_ROLE_KEY no `.env` (religa a bateria E2E
completa). Último checkpoint de sessão: `CHECKPOINT_SESSAO_2026-07-18.md`.

## 📚 Mapa dos checkpoints

| Arquivo | O que cobre | Status |
|---|---|---|
| `CHECKPOINT_SESSAO_2026-07-18.md` | **Mais recente.** Grupos: vínculo exclusivo + busca por rota; retroativo dos 17 commits de melhorias do painel (17-18/07) | 🟢 ATIVO |
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
- **Checkpoints (18/07):** todos vivem em `.claude-checkpoints/`; 1 checkpoint por sessão; atualizar este índice junto; hook pós-commit lembra a sessão de manter isso em dia.

## ⚠️ Áreas frágeis / pendências abertas

- 🟠 **Segurança driverpay:** exclusividade "2626" é client-side; RLS = `company_id OR sub IN (9999,2626)`; RPCs sem authz do chamador.
- 🟡 Bucket `driverpay-discount-proofs` público; sem trava server-side de `driverpay_periods`; `driverPayCalc.ts` sem termo Zapex.
- 🟡 Import com arquivos REAIS grandes nunca clicado até o fim (Shopee 132k só até a prévia; iMile 13k/Anjun 8k só fixtures).
- 🟡 tsc com 63 erros de baseline (fora do driverpay); `*.tsbuildinfo` fora do `.gitignore`.
- 🔵 Ponte Nova: aba driverpay existe mas dados zerados (só Caratinga populada).
