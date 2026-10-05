# CHECKPOINT — Sessão 04→05/10/2026 (madrugada) — teste REAL do tablet em casa + visual novo da facial

> **Em uma frase:** o tablet foi validado em produção numa empresa de teste (TESTE TABLET); tudo
> funcionou (ativação, trava, celular barrado, consulta, batida só pelo rosto em ~3,3s). Victor
> escolheu o visual "C · Malha neon" e mandou implementar — **NÃO começado** (limite de uso).

## 1. Estado no fim (ATENÇÃO — tem coisa de teste no ar)

- Empresa **TESTE TABLET** existe: id `7e57ab1e-0000-4000-8000-000000000001`, cnpj `00.000.000/0000-00`,
  cidade `Teste, MG`, facial obrigatória, abre na câmera, **trava LIGADA** (só nela).
- `geolocation_config` id `teste-tablet`, `block_outside=false` (servidor exige GPS, não barra distância).
- Ficha **TESTE Victor**, CPF de teste `20464832780` (inventado e válido; o Victor é a ficha real
  "Victor Angelo" em Caratinga, com rosto — por isso NÃO usar o CPF dele). Tem PIN e rosto.
- Tablet **ativo** (nome "TESTE TABLET"), atende só a TESTE TABLET. Sobra 1 código PENDENTE/vencido das
  00:56 que atende Caratinga+PN+TESTE (nunca ativado) → apagar na limpeza.
- Ponto de hoje do TESTE Victor: entrada 01:26:28 (sem saída). 1 bonus_block + 1 geo_fraud "sem GPS"
  (00:47:14) na TESTE TABLET.
- Foto de antes (02:48 UTC): md5 config real `09cec14ac6e377c3aa977f9a16745bc9`, tabelas imposto
  `159e30330f17aa62b264896d53439015`, folha cfg `b48523af29e69153a5a96a96556c3061`, 2 empresas,
  2 payment_period_config, 0 tablets, 71 error_logs sem empresa.
- Limpeza: rascunhos (c0)/(c)/(z) no relatório "provisionar" do workflow `wf_daf77be4-6d2` — ordem:
  desligar trava → remover tablet → apagar clock_devices (os 2) → filhos → empresa → conferir md5.
  ⚠️ Depois da limpeza o app do tablet volta pra câmera da CARATINGA e reconheceria o rosto real do
  Victor em casa (ponto + bloqueio de bônus na ficha real) → manter o app fechado até ir pro galpão.
- **Nenhum código mudou nesta sessão** (só dados de teste no banco + página de demonstração).

## 2. O que o teste provou (dados no banco)

Truque seguro: digitar o CPF de teste em `/erros` troca a empresa do aparelho ANTES da câmera.
Ativação ok (01:01), trava ok (01:02), celular barrado direto + consulta ok, saída só pelo rosto
(00:56:35, sem querer — câmera destampada), entrada só pelo rosto com trava (01:26:28, ~3,3s do 1º
quadro ao ponto, distância 0,265). GPS do tablet: precisão 24–67 m.

## 3. Achados (não consertados — decisões do Victor)

1. 🔴 1ª batida sem GPS (falha passageira) grava bloqueio de bônus da semana mesmo batendo 16s depois
   (celulares: 26 dias-pessoa em 60 dias). No tablet novo aconteceu na 1ª vez.
2. 🔴 Limpeza do E2E (`tests/cleanup.ts:283-291`, roda no CI a cada push e em rodada local) apaga
   geo_fraud_attempts e bonus_blocks de TODAS as empresas criados na janela da rodada. Recomendado
   consertar ANTES de rodar E2E de novo (ou rodar só sem ninguém batendo ponto).
3. Tablet novo abre na empresa padrão (Caratinga); ativar não troca a empresa; E2E 127/128 nunca
   cobriram (injetam localStorage). "Atende:" vem com todas marcadas. Tela não mostra a empresa.
4. Após falha, o painel da pessoa fica aberto sem prazo (só o sucesso volta em 35s) — tablet compartilhado.
5. `setFaceAutoResetThresholds` faz upsert onConflict company_id sem UNIQUE (hipótese de erro sempre).

## 4. Visual novo — próximo passo

- Demonstração: https://claude.ai/artifact/LoLMYAAUJAwBGo78r9qw4z (A HUD / B Anel / **C Malha neon** ← escolhido).
- Victor: *"pode implementar e ele deve ser responsivel em"* (mensagem cortada — confirmar; assumir
  celular + tablet, em pé e deitado, os 6 tamanhos do tests/128).
- Plano: refazer `FaceScanFrame.tsx` (compartilhado pelas 3 telas: FaceIdentifyClock, FaceVerification,
  FaceRegistration — contrato de props igual, lógica intocada) + cartão do nome em FaceIdentifyClock;
  moldura hoje é FIXA 220×290px (não cresce no tablet). Leve: só transform/opacity/stroke.
  Validar: unit (faceScanFrame, umaDeteccaoPorVez, facialSemCpfNaoTrava) + E2E 127/128 (depois do
  achado 2) + deploy de PRÉVIA pro Victor testar no tablet antes da produção.
- Decisões pendentes: as 3 telas (recomendado sim), bipe ao registrar, consertar a limpeza do E2E antes.

## 5. ✅ Manhã 05/10 — visual "Malha neon" IMPLEMENTADO, na PRÉVIA (produção sem mudança)

Victor (antes de dormir): *"pode implementar e ele deve ser responsivo"* + *"deixe tudo pronto para eu
validar quando acordar"* + *"tem minha permissão para rodar o que precisar"*.

- **Código:** commit `f10e452` no ramo **`feature/visual-malha-neon`** (NÃO está no main). `FaceScanFrame.tsx`
  refeito (mesmas props → as 3 telas de câmera mudam juntas), `faseDaMoldura.ts` novo, cartão "Não sou eu"
  e botão de CPF no estilo, `tests/unit/faceScanFrame.spec.tsx` (cenários do desenho antigo → comportamento).
- **Prévia (só teste):** https://sistema-ponto-i0k887bek-vitorangelol03-4967s-projects.vercel.app — feita com
  `vercel deploy --prebuilt` na cópia Linux (a Vercel só tem as chaves do banco em Production e as prévias
  pedem login Vercel). A prévia automática do ramo no GitHub sai QUEBRADA (sem chaves) — ignorar.
- **Trava da TESTE TABLET DESLIGADA** (pra prévia funcionar sem ativar o tablet de novo nesse endereço).
- **Página pro Victor** (fotos reais + passo a passo): https://claude.ai/artifact/LoLMYAAUJAwBGo78r9qw4z
- **Validação:** typecheck 0 · lint 0 · build · unit **138 arquivos / 2.080** (12 lotes, 0 worker morto, +6
  novos) · E2E 127+128 **20/20** (1ª rodada 19 + 1 flaky na limpeza; 2ª rodada, depois da revisão, 15 + o
  "primeiro acesso" falhou 2× por TEMPO com a máquina em carga 27 — robô Shopee + outro projeto — e passou
  sozinho em 1,1 min; os 4 que não rodaram passaram) · nome → ponto gravado **2,5s** (igual antes) ·
  revisão adversarial (correção/peso/encaixe) aplicada · banco: config real e tabelas de imposto **md5
  idênticos** antes/depois, zero resto "PW Test" (os restos da 1ª rodada foram apagados).
- E2E rodado com `playwright.semlimpeza.config.ts` (SÓ na cópia Linux, sem globalTeardown) — a limpeza
  global apaga bloqueios/recusas reais de todas as empresas (achado 2 do §3).

**Falta:** Victor validar no tablet (passo a passo na página) → "pode publicar" → merge do ramo no main +
push (= produção; CI roda) → conferir produção por conteúdo. Decisões dele (sem pressa): cartão do lado
com o tablet deitado; malha roxa até confirmar na verificação com CPF; barra de confiança × limite 0,50.
Depois: limpar a TESTE TABLET (§1).

## 6. ✅ Manhã/tarde 05/10 — Malha neon PUBLICADA em produção + bolinha verde corrigida

- Victor testou na prévia → pediu "no link atual". O classificador do Claude Code **barrou** o cherry-pick+push
  pro main ("Production Deploy"); o **próprio Victor publicou** pelo chat (`! git cherry-pick f10e452 && git push
  origin main`) → `b28a071` no main. Produção conferida por conteúdo (version.json + `fsf2-root` no pacote);
  **CI verde** (run 37316435950).
- Victor testou no app do tablet: *"funcionou"*, mas com **uma bolinha verde parada** à direita do centro
  (foto). Causa: ponta redonda do ✓ "escondido" só pelo tracejado 100/100 — o Chrome do **Android** desenha a
  ponta de um traço de comprimento zero; o do computador **não** (testado: headless e Chromium completo, 0
  pixel verde) — por isso E2E/fotos não pegaram. Fix `7c3d04d`: `visibility: hidden` no ✓ fora do
  "confirmado" + teste A/B (vermelho no código anterior). Validação: typecheck 0 · lint 0 · build · unit
  61/61 · E2E 127 8/8 (2,5s). Push feito por mim (não barrou) → produção conferida (`7c3d04d`, regra no pacote) · **CI verde** (run 37323390807).
- **Lição:** detalhe de desenho SVG pode diferir entre Chrome do computador e do Android — conferir no
  aparelho real (foto do Victor) antes de dar por certo.

**Falta:** Victor reconfirmar no tablet que a bolinha sumiu · limpar a TESTE TABLET quando ele disser (§1;
trava dela está DESLIGADA) · decisões sem pressa (cartão do lado com o tablet deitado; malha roxa até
confirmar na verificação com CPF) · achados abertos (limpeza do E2E apaga dado real; 1ª batida sem GPS
bloqueia bônus) · o ramo `feature/visual-malha-neon` pode ser apagado (já está no main).

## 7. ✅ Tarde 05/10 — pacote do TABLET no ar (`d7664d3`)

Decisões do Victor: câmera descansa com 1 min sem ninguém + tela escura "Toque para bater o ponto" (só
TABLET); tablet volta em 8s após gravar / 15s após erro; Caratinga + Ponte Nova no MESMO tablet com a
tela voltando pra empresa do tablet; + ajustes da revisão ("pode seguir", permissão pra aplicar o que
precisar). Revisão adversarial: 30 achados, todos confirmados — corrigidos os técnicos.

- **Tablet** = tem o segredo guardado (vale com a conferência pendente/falha; re-tenta na rede, ao voltar
  a tela e a cada volta). Troca de empresa pelo CPF NÃO é gravada no tablet: a "casa" é a empresa gravada
  (`setCompany(id, { persistir: false })`; `setCompany` agora: último pedido ganha). Tela largada
  (CPF/senha/painel/erro) volta com 45s sem toque. Consulta e "Ativar" escondidos no tablet.
- **Rosto:** quem acabou de bater é ignorado 60s (rosto comparado no próprio aparelho); batida a < 10 min
  da anterior pergunta ("Não, foi engano" é o principal) — inclusive a volta do almoço, SÓ no rosto (botão
  do celular igual a antes); descanso só com câmera aberta; resposta velha descartada.
- **Celular:** igual ao de antes, fora o aprovado (pergunta no rosto, aviso amarelo FORA da área) — sem descanso.
- **Validação:** typecheck · lint · build · unit 140/2.104 + reexecuções (113 + 29) · 3 provas inversas ·
  E2E (config sem limpeza global): **132 9/9** (8,0s · 0,2s · 45,8s · 15,3s), **128 12/12**, **127+62+08
  16/16** · banco: recusas de GPS (985) e bloqueios (160) com md5 idênticos antes/depois · produção
  conferida por conteúdo (version.json `d7664d3` + 4 textos novos no pacote) · CI run 37356295657 (rodando
  quando escrevi).
- **Lições:** 132/6 falhou por erro MEU (pessoa que já tinha batido); 132/7 "voltava em 40–41s" = relógio
  de PAREDE do WSL salta pra trás (provado: −2,2s em 50s; [diag] armou→disparou 40,49s pelo Date.now da
  página) → teste mede com `performance.now()` → 45,8s. Memória `reference_relogio_wsl_salta.md`. 128 caiu
  2× por CARGA (robô Shopee, carga 35) e passou sozinho.

**Decisões pendentes do Victor:** (1) descanso da câmera também no CELULAR (rec.: sim); (2) GPS do tablet
dentro do galpão pode dar "FORA da área" pra todos — bater 1 ponto de teste lá antes de valer; (3) 1ª
batida sem GPS bloqueia bônus da semana; (4) limpeza do E2E (roda no CI a cada push) apaga recusas/
bloqueios REAIS da janela — consertar (30 dias: 0 casos em dia útil 15h–18h, madrugada concentra; publicar
de tarde é o mais seguro até lá).
**Go-live:** limpar a TESTE TABLET (trava → remover tablet → clock_devices (os 2) → filhos → empresa); no
galpão, código novo com "Atende: Caratinga + Ponte Nova" — o tablet abre na Caratinga (empresa apagada
cai na padrão); recadastrar os 4 rostos limítrofes. Trava "ponto só no tablet" continua DESLIGADA.

## 8. ✅ Tarde 05/10 — nota do GUSTAVO (Mutum) recusada com o valor CERTO — consertado (`4dd8c9f`, edge fn v48)

- "O valor da nota (R$ 16024,64) não bate com o valor do seu espelho (esperado: R$ 15919,85)". O espelho do
  grupo traz Shopee + eMile "pago separado"; o `printed_total` gravado é o combinado (17.908,04) e a
  conferência pulava o espelho — sobrava a soma com abate CHEIO, que tirava o PNR de R$ 104,79 do João
  Victor (sem pacote; pela regra do saldo ficou pra depois). Espelho e relatório de pagamento (modo padrão)
  = **17.908,04**; a grade do painel mostra 17.803,25 (conta crua com o −104,79) → pagar pelo relatório.
- Conserto: `valorDoCnpjNoEspelhoMisto` (verde = impresso − separadas; amarelo = bruto das separadas;
  outra mistura → sem candidato). Aditivo. Só o Gustavo estava afetado na quinzena.
- Deploy: o classificador barrou o meu; **o Victor rodou** `npx supabase functions deploy driver-public-api
  --no-verify-jwt --project-ref flcncdidxmmornkgkfbb` → v48 conferida (código igual, verify_jwt=false,
  sonda 401 "Sessao invalida"); com os números do banco a parte da Shopee dá R$ 16.024,64.
- **Pendente:** o Gustavo reenviar o MESMO PDF (às 15:2x ainda não tinha) e conferir que entrou validada.
