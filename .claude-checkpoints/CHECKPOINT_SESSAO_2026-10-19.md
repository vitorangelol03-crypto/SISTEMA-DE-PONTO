# CHECKPOINT SESSÃO 2026-10-19 — leitura do espelho trocada do Gemini pro Claude (Haiku)

## O que motivou
Victor clicou em "Solicitar espelho" no painel do driver e reclamou de 2 coisas:
1. o botão não pode pedir de novo de quem **já enviou** nem de quem **já foi solicitado**;
2. **quem já enviou não estava sendo conferido automaticamente** — "verifique o que está acontecendo".

## Investigação (empírica, Caratinga aberta `9b8fd48b-2f87-444a-aef0-0d5fa73a115c`)
- A fila RODA (todos com `checked_at` de hoje, `check_attempts` subindo até 8), mas **100% das leituras voltavam vazias** (`read_packages` null, "falha na leitura"); 0 validados / 0 recusados; 7 já tinham **desistido** (`next_check_at` null).
- Histórico: leitura ~100% até **14/10**; **0 de 66 em 19/10**. Nenhum código mudou desde 14/10 → quebra **externa**.
- Diag temporário (`vision-diag`, apagado): a chave Gemini dá **HTTP 403 "Your project has been denied access"** em todos os modelos 3.x; os 2.0 dão **404 (aposentados)**. = projeto do Google bloqueado (billing/sinalização).

## Decisão do Victor
Trocar a leitora do espelho pro **Claude**, modelo **Haiku** (`claude-haiku-5-5`). A chave `ANTHROPIC_API_KEY` é dele (mandou no chat).

## O que foi feito (commit `2fb27c9`, additivo)
- `supabase/functions/_shared/visionRead.ts`: provedor `anthropic` (Messages API + **tool-use** forçado pro mesmo JSON `legivel/entregues/periodoInicio/periodoFim`), `DEFAULT_CLAUDE_MODELS=['claude-haiku-5-5']`, `visionConfigFromEnv` lê `ANTHROPIC_API_KEY`/`PROOF_VISION_PROVIDER=claude` (vazio mantém Gemini na frente). **Sem `temperature`** no corpo do Claude — a família Claude 5 recusa com HTTP 400 ("temperature is deprecated"); foi o bug que fez a 1ª tentativa falhar.
- `supabase/functions/_shared/nfVisionRead.ts`: trava — a leitura da NF é Gemini-only; se o provedor não for gemini, vai pro manual (não manda a chave do Claude pro Google).
- `tests/unit/visionRead.spec.ts`: +cobertura (liga Claude, ignora chave Gemini, sem chave = manual, monta corpo, lê/blinda resposta, sem temperature).

## Validação
- `npm run typecheck` 0 erros; `npx vitest run visionRead` **50/50**.
- Deploy: `npx supabase functions deploy driver-public-api --no-verify-jwt` → **v51**. Secrets setados via CLI (`secrets set`, 3).
- Teste ao vivo (lote supervisionado primeiro): fila reprocessada, leituras EXATAS (753=753, 649=649, 1067=1067, 3391=3391, 781=781, 130=130); divergentes são diferença real de poucas unidades; datas certas. **Nada apagado por engano.**
- Quadro final Caratinga: **35 validados (🟢 auto)**, **32 divergentes (manual)**, **6 recusados (data errada)**. `driverpay_payments.espelho_conferido` auto subiu p/ **84**.
- Outras quinzenas: só 1 print pendente e **agendado** (cron pega sozinho a cada 15 min). Nada preso.

## Como reproduzir / operar
- Fila manual: `POST https://flcncdidxmmornkgkfbb.supabase.co/functions/v1/driver-public-api` body `{"action":"proof-process-queue","limit":50}` com `Authorization: Bearer <vault proof_queue_secret>`. **Para no 1º print ilegível** (`na-fila` → break) — é de propósito (poupava cota do Gemini).
- Requeue de parados: `update driverpay_delivery_proofs set next_check_at=now(), check_attempts=0 where ... status='recebido' and check_status='pendente'`.
- Trocar modelo/provedor = **secret**, não código (`PROOF_VISION_MODELS`, `PROOF_VISION_PROVIDER`).

## Pendências
1. **BOTÃO "Solicitar espelho"** (regra do Victor, ainda NÃO feito): ao clicar, só criar pedido pra quem **tem pacote E não enviou o espelho E não foi solicitado ainda**. Nunca duplicar, nunca re-pedir de quem mandou/está verde. Não apagar ninguém. Cruza `SolicitarEspelhoModal.tsx`, `expectedProofPlatforms`/prévia e `proofAuto.ts`. Precisa plano curto + teste.
2. **Nota fiscal pro Claude** (Victor decide): hoje em manual pelo mesmo bloqueio do Google. `nfVisionRead` é Gemini-only; trocar é mudança à parte.
3. Diags `vision-diag`/`vision-diag2`: criados e **apagados** (não sobraram no ar).
