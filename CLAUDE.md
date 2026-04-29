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

Refatoração multi-empresa em sub-fases:
- ✅ 1.1 a 1.10 concluídas
- 🎯 1.11 em andamento (botão trocar empresa no header)
- ⏳ 1.12 em diante: continuar

## 🚫 PROIBIDO NESTE PROJETO

- subagent-driven-development
- dispatching-parallel-agents
- architecture-designer (sem pedido explícito)
- legacy-modernizer
- spec-miner
- Qualquer skill que faça mudanças amplas sem pedido específico
