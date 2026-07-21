# CHECKPOINT — Sessão 2026-07-20 (noite) — bugs de produção do ponto

> Victor reportou por voz: Pablo sem conseguir bater ponto; "saída sozinha" 12s
> após a entrada (Diendrel); facial não sendo pedida. Investigação empírica no
> banco/edge fn/código + correções. Commit: `793cdd3`.

## 1. Causas encontradas (com evidência, não hipótese)

1. **Facial desligada pra Caratinga INTEIRA desde 19/07 02:24** — `face_recognition_config.enabled=false`,
   updated_by 9999. Causa raiz: spec 24 ("toggle facial global on/off") clica o
   toggle REAL de prod e só restaurava na última linha; a bateria da madrugada
   de 19/07 foi interrompida no meio. Última face_auth_attempt: 18/07 12:40.
   **Corrigido:** chave religada (20/07 ~21:42) + restauração do spec em `finally`.
2. **Pablo:** celular dele NÃO fornece GPS (9 tentativas 18:04-18:05 todas com
   coords null em `geo_fraud_attempts`; idem 18/07 — no mesmo minuto em que
   PASSOU na facial). Servidor recusa por regra antifraude e cria bonus_block.
   **Bug real no meio:** tela lia `result.error`, edge fn manda recusa em
   `result.message` → funcionário via erro genérico. Corrigido
   (`clockMessages.ts` + 5 units). Pablo precisa LIBERAR a localização no
   navegador do celular (ação humana, avisar operação).
3. **"Saída sozinha" (Diendrel 12s; João Pedro 13s na mesma data):** NÃO existe
   caminho no código que registre saída sem request (edge fn lida linha a linha).
   Padrão histórico: abr 4, mai 1, jun 6, jul 12 casos, quase todos com
   **10-15s** entre entrada e saída, MESMO COM FACIAL LIGADA (casos de 02-11/07).
   Conclusão: defeito de UX — após a entrada, o botão laranja "REGISTRAR SAÍDA"
   aparece na mesma posição e parte dos funcionários toca nele achando que é
   confirmação (e passa até pela facial achando que faz parte). Fila da madrugada:
   15 pessoas batem 02:02-02:10; há aparelhos compartilhados (Marcos/Gerson com
   GPS idêntico até a 7ª casa, accuracy 2000m = torre de celular).

## 2. Operações de DADO em produção (todas com backup prévio)

Backups + `restore.sql` em `backups/2026-07-20-correcoes/` (gitignored, local).
- Facial Caratinga religada (`enabled=true`).
- Diendrel 20/07: saída 07:45:28 (12s) limpa; entrada 07:45:16 preservada; dia
  aberto pro 2626 lançar a saída real.
- João Pedro 20/07: saída 02:07:05 (13s) limpa; entrada 02:06:52 preservada;
  colegas do turno saíram ~07:30 (referência pra saída real).
- Bonus_blocks do Pablo removidos (semanas 13-19/07 e 20-26/07) — decisão do
  Victor. Obs: se ele tentar de novo sem GPS, o sistema recria (regra).

## 3. Validação do commit `793cdd3`

- tsc 0 erros; build ✓ (2m02s).
- Units: rodada completa 34/35 arquivos, 551 ✅ / 1 skip; `driverPayImportRates`
  verde às 21:56 + 5 casos conferidos manualmente via Node (função pura).
- **E2E NÃO rodou nesta sessão** — decisão deliberada: bateria E2E escreve no
  banco de prod e o spec 24 pisca a facial real; não fazer isso à noite com
  turno da madrugada batendo ponto ~02:00. Rodar spec 23+24 em janela segura.

## 4. Aprendizados de infra

- **vitest no /mnt/c:** criar worker custa ~50-60s (jsdom do DrvFs = 48s) e o
  `START_TIMEOUT` do vitest é 60s HARDCODED → arquivos aleatórios "Failed to
  start forks worker". Não é falha de teste. Mitigação: rodada completa com
  `--maxWorkers=2` + rerodar isolado os que não iniciaram.
- `error_logs` vazio no período; logs HTTP das edge fns só guardam poucas horas
  — o banco (attendance/geo_fraud_attempts/face_auth_attempts) é a fonte forense.
- `bonus_blocks`/`geo_fraud_attempts` revelam problemas de GPS da operação:
  vários funcionários com coords null ou fora do raio (accuracy 2000m ignorada
  na validação de distância — melhoria futura).

## 5. Features de proteção ENTREGUES (commit `3603c96`, decisões do Victor)

Victor decidiu: (1) confirmação de saída = 10 min; (2) mantém bloqueio de bônus
pra tentativa sem GPS; (3) auto-retorno = 35 segundos.
- **Trava anti-saída-fantasma**: saída < 10 min da marcação anterior abre
  confirmação ("Não! Foi engano" em destaque, saída real em botão secundário).
  2 marcações: saída × entrada; 4 marcações: saída almoço × entrada e saída
  final × volta almoço. Lógica pura em `clockGuards.ts` (13 units).
- **Auto-retorno 35s**: após registrar ponto, a tela volta pro CPF sozinha
  (aparelho compartilhado); mensagem de sucesso avisa. Timer limpo em
  logout/nova batida/unmount.
- **GPS bloqueado**: `performClock` checa `navigator.permissions` ANTES de
  bater; se denied → overlay ensina a liberar (cadeado → Permissões →
  Localização), SEM chamar o servidor (não gasta tentativa nem cria
  bonus_block). Permissão 'prompt' → navegador pergunta na hora (fluxo normal).
  Navegador sem permissions API → fluxo antigo.
- Validação: tsc 0; suite completa **36/36 arquivos, 569 ✅ / 1 skip / 0
  falhas em rodada única**; build ✓.

## 6. E2E com cliques reais RODADO + causa raiz VERDADEIRA da facial (commit `cf2636e`)

Victor perguntou "está testando com cliques reais?" — resposta honesta era NÃO;
corrigido na hora (madrugada 21/07, com funcionários PW Test — aditivo):
- **Spec 62 novo, 3/3 verdes (chromium, cliques reais):** confirmação de saída
  rápida ("Não! Foi engano" não grava, confirmar grava — conferido no banco),
  auto-retorno ao CPF em ~35s, overlay de GPS bloqueado sem chamar o servidor
  (0 geo_fraud, 0 bonus_block, 0 attendance). Único mock: o ESTADO 'denied' da
  permissão via init script — Playwright só sabe CONCEDER permissão.
- **CAUSA RAIZ REAL da facial desligada era o spec 23, não o 24:** linha
  `update face_recognition_config set enabled=false` SEM filtro de empresa e
  SEM restauração — qualquer bateria desligava a facial de TODAS as empresas.
  (O spec 24 restaura ao fim; só falharia se interrompido.) Fix: flag
  `face_recognition_enabled=false` no próprio funcionário de teste, setado
  ANTES da tela carregá-lo; linha global REMOVIDA. Spec 23 rerodado: 7 ✅/2 skip.
- Config de prod conferida ENABLED após as duas baterias (a prova do conserto).
- Aprendizados: guard anti-toque-duplo de 3s engole clique imediato do teste →
  repetir clique até o diálogo abrir (`toPass`, condição, não sleep); estado
  'denied' de permissão não é alcançável pela API do Playwright.

## 7. Pendências

- Saídas reais de Diendrel e João Pedro: lançar via mestre 2626 (manual).
- Avisar operação: Pablo liberar GPS; aparelhos compartilhados com GPS de torre
  (accuracy 2000m rejeitada por distância — melhoria futura: considerar accuracy).
- Bateria E2E completa de regressão em janela segura (specs antigos da tela de
  ponto podem precisar de ajuste pro fluxo novo — 23 e 62 já estão verdes).
- Spec 48 mexe na config da facial via upsert enabled=true (direção segura) —
  conferir restauração dele na próxima janela.
- Push é do Victor (commits locais: `793cdd3`, `e5732f5`, `3603c96`, `0a4a53c`,
  `cf2636e`).
