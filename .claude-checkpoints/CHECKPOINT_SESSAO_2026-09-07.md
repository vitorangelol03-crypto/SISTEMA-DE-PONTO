# CHECKPOINT — Sessão 07/09/2026

> Continuação direta do dia 05/09 (nota fiscal dividida do driverpay). O Victor
> validou as notas do GESSILEY e pediu pra conferir se o **relatório simples** sai
> com 2 pagamentos separados. Saía — mas os dois no mesmo nome. A investigação achou
> a causa e virou trava.

---

## 1. O que foi verificado (antes de mudar qualquer coisa)

Rodei o relatório simples de verdade (as funções reais) com o estado real de produção
do grupo do Gessiley na 1ª quinzena de agosto:

| Nome | Valor | Destino |
|---|---|---|
| Joaerson Antonio de Freitas | R$ 7.990,30 | 55.857.717/0001-46 |
| Joaerson Antonio de Freitas | R$ 7.990,30 | 55.857.717/0001-46 |

Soma R$ 15.980,60 = exatamente o total do grupo (9.339,00 + 2.818,20 + 1.962,40 +
1.683,00 + 178,00). A divisão do pagamento **funciona**; o problema é que as duas
linhas vão pro mesmo lugar.

**Causa (lida nos 2 PDFs, não deduzida):** as duas notas foram emitidas pelo MESMO
prestador — JOAERSON ANTONIO DE FREITAS, CNPJ 55.857.717/0001-46. O que muda entre
elas é o TOMADOR (CLAYTON B DOS SANTOS 11.802.464/0001-38 e CD LOGISTICA LTDA
53.824.315/0001-10). O CNPJ do Gessiley (51.046.418/0001-70) não aparece em nenhuma.

**Por que passou:** o `nota_emitter_id` que a edge fn comparava é o CNPJ do TOMADOR
(a tabela `driverpay_nota_emitters` é Shopee/Anjun/Loggi e iMile). Nunca existiu
comparação do CNPJ de quem EMITE — apesar de a tela prometer isso desde 05/09.

---

## 2. Decisões do Victor (07/09)

1. Os dois pagamentos **não podem sair no mesmo nome**; cada nota da dupla em um
   CNPJ diferente; a linha leva o nome da nota e a chave PIX **do dono daquele CNPJ**.
2. **As notas do Gessiley que já passaram ficam como estão** — não recusar. A trava
   vale **da próxima dupla em diante**. (Consequência aceita: o pagamento desta
   quinzena sai nas 2 linhas do Joaerson.)
3. Pode criar a coluna nova e fazer a trava.

---

## 3. O que mudou (`9bc2172`, no `main`)

- **Migration `20260907120000`** — coluna `matched_cnpj` em
  `driverpay_nota_fiscal_files`. Aplicada em prod pelo MCP e conferida no catálogo.
- **`nfCheck`** — `matchedCnpjs` no resultado, paralelo a `matchedNames`, sempre da
  MESMA LINHA nome+CNPJ do cadastro.
- **Edge fn `driver-public-api` (v42 → v43)** — a 2ª nota do mesmo CNPJ da 1ª é
  recusada, dizendo qual CNPJ falta. Sem CNPJ dos dois lados **não recusa** (nota
  antiga / driver sem cadastro): nunca recusar no escuro.
- **App do driver** — o aviso NOMEIA os dois emissores em vez do genérico "outro
  CNPJ", e o cartão da 2ª nota diz quem tem que emitir.
- **`splitEnabled`** — dividir só aparece pra quem tem **2 CNPJs** cadastrados.
  Impacto medido antes: só o Gessiley tem esse cadastro e ele já tem os 2. Ninguém
  perde a opção.
- **Relatório** — a chave PIX passa a ser achada pelo **CNPJ** da nota (o nome fica
  de reserva pras notas antigas). Nome sozinho não distingue CNPJ.
- **Chaves PIX cadastradas** (dados, não schema): Joaerson `55857717000146` e
  Gessiley `51046418000170` — vieram do cadastro que já existia na ficha
  (`pix_key` / `recebedor_pix`), não de chute. A NFS-e não tem campo bancário.

---

## 4. Como foi validado

- **E2E `tests/107` 5/5 verde** contra a edge fn **deployada**, com PDFs de verdade.
  Teste **E** novo: 1ª nota pelo emissor A passa; a 2ª pelo MESMO emissor (com
  tomador diferente) é **recusada** e não é gravada; a tela diz quem tem que emitir
  a 2ª. Só passa com a trava no ar.
- typecheck 0 · lint 0 · build limpo · **1361 unitários** (4 novos em `nfCheck`
  cobrindo `matchedCnpjs`, 3 no relatório cobrindo o casamento por CNPJ).
- Deploy da edge fn conferido por versão (43) + sonda HTTP 401 na rota.

**Falha honesta no caminho:** o teste A quebrou nos 4 browsers na primeira rodada —
era o teste, não o produto: o nome do emissor passou a aparecer 2x na tela (aviso
novo + lista) e o `getByText` sem `.first()` viola o strict mode. Corrigido o
locator e reforçado com `toHaveCount(2)`, que prova o texto novo.

---

## 5. Pendências

- 🟡 Avisar o **Gessiley** que a partir de agora a dupla exige um CNPJ em cada nota
  (a dele desta quinzena fica como está, por decisão do Victor).
- 🟡 **Nota do FERNANDO MARTINS** (R$ 13,20 a descoberto, 1ª quinzena de julho,
  concluída) — segue esperando decisão desde 05/09.
- As pendências antigas de `CHECKPOINT_PROXIMOS_PASSOS.md` (§2.2 policy só-2626,
  §2.3, §2.4, §2.5) seguem **intocadas**.
