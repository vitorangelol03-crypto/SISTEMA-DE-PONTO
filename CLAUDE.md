# CLAUDE.md — Override de projeto

> Este arquivo SOBRESCREVE o ~/.claude/CLAUDE.md global durante 
> a refatoração multi-empresa do Sistema de Ponto.

## ⛔ MODO CIRÚRGICO ATIVO

Durante este projeto, NÃO ativar skills automaticamente.
NÃO usar subagentes paralelos. NÃO refatorar código além do escopo.
NÃO sugerir mudanças arquiteturais não solicitadas.

## ✅ COMO TRABALHAR AQUI

1. Seguir EXATAMENTE as instruções de cada prompt do Victor
2. Uma sub-fase por vez, na ordem, sem antecipar
3. Mudanças aditivas: NUNCA quebrar o que já funciona
4. Sempre validar antes de commit: tsc, build, playwright
5. NUNCA fazer push — só commit local
6. Se algum teste falhar, mostrar para o Victor antes de "consertar"
7. Se houver dúvida, PERGUNTAR antes de assumir

## 📋 ESCOPO ATUAL

- ✅ Refatoração multi-empresa CONCLUÍDA (v2.0.0-multi-tenant em produção)
- 🎯 Aba **Pagamentos Driver** (branch `feature/pagamentos-driver`) — em evolução
- Estado detalhado: ler `.claude-checkpoints/00-INDEX.md` PRIMEIRO ao abrir o projeto

## 🧭 CHECKPOINTS (regra deste projeto, desde 2026-07-18)

1. Todos os checkpoints vivem em `.claude-checkpoints/` — NUNCA na raiz.
2. Ao abrir o projeto: ler `00-INDEX.md` + o último `CHECKPOINT_SESSAO_*.md`. Só.
3. Ao fim de cada leva de trabalho (e SEMPRE antes de encerrar a sessão):
   criar/atualizar o `CHECKPOINT_SESSAO_<data>.md` da sessão E atualizar o `00-INDEX.md`
   (estado atual + tabela + decisões novas). Um hook pós-commit lembra disso.
4. Checkpoint de sessão é CURTO: o que mudou, por quê, como foi validado, pendências.
   Não re-listar o que o git já conta (`git log` é a fonte dos detalhes).
5. Checkpoint nunca é apagado — vira "superseded" na tabela do índice.

## 🚫 PROIBIDO NESTE PROJETO

- subagent-driven-development
- dispatching-parallel-agents
- architecture-designer (sem pedido explícito)
- legacy-modernizer
- spec-miner
- Qualquer skill que faça mudanças amplas sem pedido específico
