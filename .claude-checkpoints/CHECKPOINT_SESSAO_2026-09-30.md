# CHECKPOINT — Sessão 30/09/2026 (madrugada, Victor dormindo)

> **Em uma frase:** facial sem CPF que recusa gente de verdade + "câmera bloqueada" falso +
> ponto só no tablet da empresa. Trabalho autorizado pra noite inteira.

> ⚠️ Autorização por escrito (30/09 ~00:30): *"pode seguir tem autorização para fazer tudo e
> aplicar migratinha quero tudo validado com cliquees rais"* + *"fui dormi"* + *"trabalhe com
> força maxima e tem permisão para implemneta e fazer tudo"*.

---

## 0. Decisões do Victor (não re-perguntar)

Ele respondeu "pode seguir" ao plano com as recomendações — valem as 5:

1. **Facial sem CPF (1:N) passa a exigir o MESMO nível da facial com CPF (1:1)** — continuam as
   3 travas contra confusão (margem contra o 2º colocado, nome na tela com 3s + "Não sou eu",
   reconferência 1:1 no servidor).
2. **Só o 2626 cadastra tablet.** Se o tablet for formatado/limpar dados, cadastra de novo.
3. **Todo mundo só bate no tablet, supervisor incluído, sem exceção.** Correção de ponto
   segue pelo painel do 2626.
4. **No tablet continua o "digitar CPF e senha" como plano B**, e ainda exige o rosto.
5. **Tudo sobe com a trava DESLIGADA**; ele liga depois de cadastrar os tablets.
6. Quantos tablets e de qual empresa: **não respondeu** — o desenho aceita N tablets por empresa.

## 1. O que o banco mostrou antes de mexer (29/09, dados reais)

- Limite do 1:N era **0,42** de distância; o do 1:1 é **0,50**. Das **597** batidas com facial
  1:1 aceitas em 14 dias, **250 (42%)** seriam recusadas pelo 1:N → "Não reconheci" pra gente
  de verdade.
- Distância entre rostos cadastrados de pessoas DIFERENTES: Caratinga menor **0,463** (2 pares
  abaixo de 0,50, 16 abaixo de 0,55); Ponte Nova menor **0,551**.
- "Câmera bloqueada" sem estar: o código trata QUALQUER `NotAllowedError` como bloqueio do
  usuário, e nenhum erro de câmera é registrado no servidor.

## 2. Banco (APLICADO em produção, com a trava DESLIGADA nas duas empresas)

- Migration `20260930034644_ponto_so_no_tablet`: `companies.require_clock_device` (nasce
  false), tabelas `clock_devices` + `clock_device_companies` (RLS ligado, sem policy, sem grant
  pra anon/authenticated — o banco guarda só sha256 do código e do segredo), funções do painel
  `clock_device_list/create_pairing/revoke/set_lock` (conferem `sub = 2626`), funções da tela
  `clock_device_activate/resolve` (só service_role), gatilho que recusa mudar a trava por UPDATE
  direto, e colunas de diagnóstico em `face_auth_attempts` (`outcome`, `best_distance`,
  `second_distance`).
- 🔴 **O teste pegou um defeito meu** e ele virou a migration `20260930035209`: a "licença" que a
  função do 2626 usava pra passar pelo gatilho (`set_config(..., true)`) vale até o fim da
  TRANSAÇÃO — um UPDATE direto depois dela, na mesma transação, desligava a trava. Na operação
  real não vazava (cada chamada da API é uma transação), mas saiu: o gatilho agora só olha
  `current_user` (a função roda como `postgres`).
- **Provado no banco (17 passos, transação desfeita no fim):** 9999 não gera código nem mexe na
  trava; código tem 8 símbolos do alfabeto sem I/O/0/1 e vale 15 min; ligar a trava sem tablet
  ativo é recusado; o código ativa UMA vez; segredo errado não resolve; UPDATE direto como
  `authenticated` é recusado mesmo depois da função na mesma transação; o último tablet de uma
  empresa com trava ligada não pode ser removido; código vencido não ativa; anon não executa nada.

## 3. Servidor (edge functions) — código pronto, ensaiado em funções `-next`

- `_shared/faceIdentify.ts`: `LIMITE_FACIAL = 0.5` (1:1 E 1:N) + `decidirIdentificacao`
  (matched / no_match / ambiguous / no_candidates, margem 0,08 mantida).
- `_shared/clockDevice.ts`: código de ativação, sha256 (bate com o `digest` do Postgres —
  conferido com valor calculado no banco), segredo base64url, `decidirAparelho`, `resolverTablet`
  (erro de banco LANÇA: trava ligada nunca libera no escuro).
- `clock-in-validated`: trava do tablet ANTES de qualquer gravação (inclusive do cadastro do rosto
  na 1ª vez); recusa com `device_error` + mensagem, sem bonus_block nem geo_fraud.
- `employee-public-api`: `identify-face` com limite novo + desfecho/distâncias gravados + exige
  tablet com a trava ligada; ações novas `clock-device-status`, `activate-clock-device`,
  `log-clock-event` (erro de câmera → `error_logs`, texto truncado).
- **Ensaio:** publicadas como `clock-in-validated-next` / `employee-public-api-next` e rodado
  `tests/unit/edgeFnPontoSoNoTablet.spec.ts` contra elas → **6/6** (sem segredo / inválido /
  removido / de outra empresa recusados sem gravar nada; tablet certo bate e a facial continua
  valendo; identificação sem CPF exige tablet e reconhece a 0,46; código vira segredo uma vez;
  erro de câmera vai pro error_logs). Limpeza conferida: zero resto no banco.

## 4. Tela

- **Achado grave e antigo (as 3 telas de câmera):** a tela de "Carregando câmera" era devolvida
  SEM o `<video>`. A câmera abria sem ter onde mostrar a imagem, a tela ficava com vídeo PRETO e
  só o vigia de "vídeo preto", 2s depois, fechava e abria a câmera DE NOVO — toda abertura
  custava ~2,5s e dois pedidos de câmera seguidos (fechar e reabrir rápido é o que faz muito
  Android responder "câmera ocupada"). Agora o vídeo fica sempre montado e o resto aparece por cima.
- Câmera num lugar só (`useFrontCamera`): erro classificado pela causa (`cameraAccess.ts`) com um
  texto por causa (`CameraProblem.tsx`) — "Falta liberar a câmera" (pedido fechado, o caso da
  queixa: o Chrome recusa sozinho depois de 3 pedidos fechados e o site segue em "Perguntar"),
  "Câmera bloqueada" (só quando está), "Câmera desligada no aparelho", "Câmera ocupada"; o
  "tentar de novo" é pelo toque; câmera que morre com a tela apagada é reaberta quando a tela
  volta; todo erro vai pro servidor.
- Facial sem CPF: "Não reconheci" só depois de 3 recusas seguidas (antes: a cada quadro ruim).
- Tela de ponto conhece o tablet: barra cedo o aparelho não autorizado, tela de ativação por
  código, nome do tablet na tela; na verificação com CPF, câmera que não abre não diz mais
  "reconhecimento falhou, procure o supervisor".
- Painel: cartão "Tablets de ponto" em Configurações, só pro 2626.

## 5. Validação até aqui

- `npm run typecheck` 0 · eslint dos arquivos tocados 0 · `deno check` da clock-in-validated ok
  (na employee-public-api o único erro é o import ANTIGO do bcryptjs, linha 57, que já estava lá).
- Unitários novos: 25 (regra do tablet + decisão da facial) + 26 (câmera) + 3 (tablet na tela) +
  o spec antigo da facial sem CPF adaptado (câmera falsa completada; o aviso vem após 3 recusas).
- **A/B provado:** limite 0,42 de volta → 4 testes vermelhos; `FaceIdentifyClock` antigo → os 6
  testes da câmera vermelhos (inclusive o do vídeo que abria duas vezes).

## 6. Manhã (30/09) — o que mudou depois que o Victor acordou

- ⚠️ O computador **parou de madrugada** (relógio saltou de 01:31 pra 07:54) — por isso a
  publicação só saiu de manhã.
- **Instrução nova do Victor (08:30):** *"deixa tudo pronto pra ativar, mas por enquanto ainda
  permite digitar o CPF, deixa a trava DESLIGADA, a gente tem que validar isso primeiro, com os
  testes, e o pessoal batendo o ponto normal"*. → Trava **desligada** nas 2 empresas (conferido);
  o botão de CPF continua; testes só em empresa fixture.
- **Meta do Victor (08:45):** *"a validação facial tem que ser feita em no máximo 5 a 7 segundos"*.

### Edge functions em produção (07:56, janela quieta, trava desligada)
- `employee-public-api` **v18** · `clock-in-validated` **v17** (o 1º deploy dela deu "erro interno
  500" do Supabase e ficou na v16 intacta — a 2ª tentativa subiu). Antes: baixei as publicadas e
  eram idênticas ao HEAD (ninguém publicou nada no meio).
- Validado contra PRODUÇÃO: `edgeFnPontoSoNoTablet` 6/6 + regressão `edgeFnClockFacialGeoEstrito`,
  `edgeFnClockFourMarkingsLunch`, `edgeFnEmployeePublicApi` (6 passaram, 1 pulado de propósito).
  Funções de ensaio `-next` apagadas.
- 🔑 A correção do limite da facial sem CPF (0,42 → 0,50) está **no ar desde 07:56** — avisado.

### Três defeitos achados pelo teste de cliques reais (os três na TELA, nenhum publicado)
1. 🔴 **Detecções empilhadas** (defeito ANTIGO, nas 3 telas de câmera): o laço disparava uma
   detecção nova a cada 0,5–0,7s sem esperar a anterior. Medido no Chromium, com a mesma biblioteca
   e modelos: sem guarda 56 detecções ao mesmo tempo e rosto achado aos 35s; com guarda 1 por vez e
   rosto aos 13s. Era o "fica procurando o rosto e não reconhece" num aparelho fraco. Guarda
   `detectInFlightRef` nas 3 telas + `tests/unit/umaDeteccaoPorVez.spec.tsx` (A/B: código antigo
   2/2/3 detecções simultâneas, falha; novo 1, passa).
2. 🔴 **Tela trocava de CPF pra câmera com a pessoa digitando** (corrida antiga que eu PIOREI ao
   esperar a conferência do tablet): a tela nascia no CPF e trocava quando a empresa carregava.
   Agora nasce em "Preparando..." e só mostra CPF ou câmera quando já sabe; conferência do tablet
   com prazo de 5s (sem resposta = segue, e o servidor decide na batida).
3. 🔴 **GPS "aquecido" com watchPosition** (erro MEU desta manhã): medido no Chromium, com o
   acompanhamento ativo o pedido de posição nova da batida estoura os 10s → "Localização não
   fornecida". Trocado por **GPS pedido mais cedo**: o pedido sai quando a pessoa é reconhecida (ou
   aperta Registrar) e corre junto com a contagem/verificação; a posição continua nova.

### Tempo (meta 5–7s)
- Dado real (14 dias, sistema antigo): do rosto reconhecido ao ponto gravado, **mediana 7,1s**,
  p90 8,6s, pior 13s (3s são a contagem com o nome — decisão de 04/09).
- No teste de cliques reais depois das correções: **nome na tela → ponto gravado 3,4s** (3s de
  contagem + 0,4s). "Câmera pronta → nome" deu 15s NESTA máquina (navegador sem placa de vídeo e
  dividindo CPU com o robô da Shopee) — no tablet depende do aparelho; medir com o dado real
  (`face_auth_attempts.outcome` + horário da batida) depois de publicar a tela.
- Consultas depois do reconhecimento agora saem juntas (antes, uma esperava a outra).

### E2E com cliques reais — `tests/127-ponto-so-no-tablet.spec.ts` (câmera falsa com ROSTO)
- Rostos de domínio público (NASA) em `tests/fixtures/facial/*.y4m`.
- **7/7 (9 passos)**: 2626 gera código → tablet ativa → trava liga (antes não deixa) → CPF+senha+
  cadastro do rosto+ENTRADA com verificação facial → celular pessoal barrado (nem pelo CPF) →
  SAÍDA só pelo rosto → outra pessoa "Não reconheci" → último tablet não sai com trava ligada,
  desliga e remove, aparelho volta a ser comum → pedido de câmera fechado mostra "Falta liberar a
  câmera" e o toque resolve.
- Rodado a partir de uma **cópia no disco do Linux** (`~/projetos/ponto-teste`): nesta manhã ler
  arquivos de /mnt/c ficou tão lento (robô da Shopee) que carregar o jsdom levou 200s e o vitest
  não subia (limite fixo de 60s do vitest). Ver memória nova.

## 7. Estado no fecho (conferido)

- **No ar:** tela (Vercel serve `index-XR0v5Hlh.js`, o MESMO hash do build local; conferido por
  CONTEÚDO: "clock-device-status", "Falta liberar a câmera", "Ponto só no tablet da empresa" no
  bundle e o cartão no chunk de Configurações) + edge fns v17/v18 (baixadas e comparadas: iguais ao
  repo) + migrations. Produção aberta só olhando: `/clock` abre em 1,4s na câmera, CPF disponível,
  link de ativação visível, zero erro de página.
- **Trava DESLIGADA** em Caratinga e Ponte Nova; **nenhum tablet cadastrado**; zero resto de teste.
- **Ponto real intacto:** impressão (md5) dos 11 meses anteriores idêntica antes/depois das baterias;
  hoje 18 batidas reais antes e depois.

## 8. Validação final

| O quê | Resultado |
|---|---|
| typecheck · lint (projeto inteiro) · build | 0 · 0 · limpo |
| Unit (131 arquivos) | **1.995 passaram**, 1 pulado (o de sempre) |
| A/B (vermelho no código antigo) | limite 0,42 → 4 falhas; câmera → 6; detecção empilhada → 3 |
| Banco (17 passos, transação desfeita) | 17/17 |
| Edge fns em produção | `edgeFnPontoSoNoTablet` 6/6 + regressão (facial obrigatória, 4 batidas, API pública) |
| E2E cliques reais com rosto (`tests/127`) | **7/7** (9 passos) |
| E2E regressão (02, 107, 48, 62, 101, 13) + (38, 100-K) | 41 + 12 passaram; os 2 do 62 "GPS liberado" falham IGUAL no código antigo |
| **CI do `eba2e45`** (run 36717548687) | **verde nos 3 jobs**: tsc+eslint, vitest (unit, com o teste ao vivo das edge fns), playwright (e2e) |

## 9. O que precisa do Victor (decisões dele — nada disto eu faço sozinho)

1. **Ligar a trava** quando ele achar que a facial está validada no uso real (hoje: desligada).
   Antes: cadastrar os tablets (Configurações → Tablets de ponto → gerar código → digitar no tablet).
2. **Recadastrar o rosto de 3 pessoas "no limite"** (distância média 1:1 ≥ 0,45, cadastro de maio):
   Sabrina Emiliana De Seixa Lana (0,465), Pablo Henrique Azevedo Goularte (0,457), Sergio Vinicius
   Vidal Brandao filho (0,451) — de preferência NO TABLET, que é a câmera que vai usar.
3. **Brecha `save-face` sem senha** (troca o rosto de qualquer um pelo id) — recomendo exigir o PIN.
4. **`admin_secret_password` legível pelo anon** — recomendo tirar a coluna do alcance público.
5. Contagem de 3s com o nome (decisão de 04/09): com ela o trecho final dá 3,4s; se ele quiser mais
   folga pra meta de 5–7s, dá pra baixar pra 2s (decisão dele).
6. Medir no tablet de verdade: depois de uns dias, `face_auth_attempts` (desfecho + distâncias) +
   horário da batida dizem quanto tempo leva e quantas tentativas até reconhecer.

## 10. Tarde — "pode corrigir": as duas falhas de segurança (FECHADAS)

**Victor:** *"pode corrigir"* (itens 3 e 4 do §9).

### O que a investigação achou (maior do que o relatado)
- `lookup-employee` (público, só o CPF) devolvia a **FICHA INTEIRA**: `pin_hash` (PIN de 4–6
  dígitos em bcrypt se descobre por tentativa em minutos), rosto cadastrado, PIX, telefone...
- `set-pin` trocava o PIN de **qualquer** funcionário sem login — e o botão "Definir PIN" do
  painel usava justamente essa ação pública.
- `save-face` / `face-descriptor` sem PIN. Junto: pôr o PRÓPRIO rosto na ficha de um colega e
  bater por ele. **Provado:** os 4 testes novos falhavam contra a produção antiga.
- `companies.admin_secret_password` era a senha **ATUAL** da aba Admin em texto puro
  (`verify_admin_secret` = true nas 2 empresas), numa tabela legível por qualquer um. A
  conferência de verdade usa `admin_secret` (bcrypt) desde 12/05; a coluna era sobra.

### Correção (ordem pra não derrubar ninguém: tela primeiro, servidor depois)
- Migration `20260930132704`: apaga a coluna + RPC `admin_set_employee_pin` (confere
  employees.edit e a empresa do login; provado 7/7 no banco; hash do banco aceito pelo
  bcryptjs 2.4.3 do servidor).
- `52231d1` (tela): rosto e batida mandam o PIN da sessão; "Definir PIN" pela RPC. CI verde.
- Servidor (employee-public-api **v19**, clock-in-validated **v18**, conferidas = repo):
  lookup só com 10 campos; set-pin só no 1º acesso (condição no UPDATE, 409); save-face e
  face-descriptor com PIN (401); cadastro de rosto pela batida com PIN. `_shared/pin.ts` = a
  conferência num lugar só (bcryptjs `?no-dts` — o `deno check` agora passa nas duas).
- `1141fb6` (servidor + testes).

### Validação
- Unit 1.999 (131 arq.) · edge fns em produção 16/16 (+1 pulado de propósito) · A/B: 4 falhas
  na produção antiga · E2E 127/05/79/02 com tela + servidor novos: **21/21** · banco limpo.
- **CI verde nos dois envios:** `52231d1` (run 36723902441) e `1141fb6` (run 36725591890) —
  tsc+eslint, vitest (com os testes ao vivo de segurança contra a produção nova) e playwright.

### Precisa do Victor
- 🔴 **Trocar a senha da aba Admin** — a atual esteve legível por qualquer um (até hoje).
- Fica aberto (não pedido): `today-attendance`/`attendance-history` entregam o ponto (com
  latitude/longitude) de qualquer id; a batida confia nas coordenadas que o aparelho manda —
  só a trava do tablet fecha isso de verdade.

## 11. ⏸️ PAUSA PRA REINICIAR O PC — RETOMAR EXATAMENTE DAQUI

**Estado no momento da pausa (30/09 ~11:25):** tudo commitado e no ar (último código `1141fb6`,
checkpoint `4b453dc`+este), CI verde, trava do tablet DESLIGADA nas 2 empresas, nenhum tablet
cadastrado, banco sem resto de teste. Nada rodando que dependa do PC.

### Pedido novo do Victor (ainda NÃO programado — esperando as 3 decisões dele)
*"a tela do ponto vai ficar responsiva no touch, encaixadinha na tela... funções de mobile onde
você vai no navegador e consegue instalar como se fosse um aplicativo... ocupando a tela certinho
sem parecer que está aberto no navegador... na horizontal ou na vertical... sem nada cortado ou
com muito zoom"*.

**Plano apresentado (ele ainda não respondeu):**
1. App instalável (PWA): `manifest.webmanifest` (nome, ícone, cor, `display: fullscreen` com
   `display_override`, `orientation: any`, `start_url: /clock`, `scope: /clock` — assim só a tela
   de ponto é instalável, o painel não), ícones 192/512 + maskable gerados a partir do
   `public/favicon.svg` (relógio azul), e **consertar o `public/apple-touch-icon.png`, que está
   CORROMPIDO** (PIL não abre). Metas do iOS (apple-mobile-web-app-*).
2. Tela encaixada: cartão maior no tablet (`md:`/`lg:`), teclado e letras maiores pro dedo,
   altura com `100dvh` (sem cortar embaixo), variantes `landscape:`/`portrait:` do Tailwind 3.4,
   deitado usando melhor a largura, safe-area (`viewport-fit=cover` + `env(safe-area-inset-*)`).
3. Zoom travado SÓ na tela de ponto (meta viewport trocado no mount do /clock e devolvido ao sair;
   `touch-action: manipulation`) — o painel continua com zoom.
4. Tela sempre acesa com o app de ponto aberto (Screen Wake Lock, re-pede ao voltar a tela).
5. Testes: fotos em 4 tamanhos (tablet em pé 800×1280, deitado 1280×800, 7" deitado 1024×600,
   celular 390×844) conferindo `scrollWidth ≤ innerWidth` e nada fora da tela + E2E 127.

**✅ DECIDIDO pelo Victor (30/09 ~11:30): "sim nos três"** — nome "Ponto" + relógio azul do
sistema · tela cheia total · tela sempre acesa com o app de ponto aberto. **Já pode programar.**

**As 3 decisões (respondidas acima):**
1. Nome/ícone no tablet: **"Ponto" + o relógio azul do sistema** (ou ele manda o logo da empresa).
2. Tela cheia total (some a barra de hora/bateria do Android): **sim**.
3. Tela sempre acesa com o app de ponto aberto: **sim**.

### O que já foi apurado (não refazer)
- **Não precisa de service worker próprio:** o Chrome instala pelo menu ⋮ → "Instalar app" sem
  SW desde a v108 no celular/tablet (fonte: developer.chrome.com/blog/update-install-criteria).
  Só o banner automático exigiria fetch handler — dispensável (instala-se uma vez por tablet).
  ⚠️ E um SW em `/` **derrubaria o `firebase-messaging-sw.js`** (registrado em `/` por
  `src/lib/pushNotifications.ts:101`) — não criar SW no escopo `/`.
- Fotos de ANTES em `~/projetos/shots/antes/` (disco do Linux, sobrevive ao reinício): no tablet a
  tela é um cartão de 448px no meio (`max-w-md`), letras pequenas, muito espaço vazio; nada
  cortado, `scrollWidth = innerWidth` nos 4 tamanhos.
- Tailwind 3.4.1 (tem `landscape:`/`portrait:`).
- Cópia de teste no Linux: `~/projetos/ponto-teste` (sincronizar com rsync antes de testar —
  memória `reference_testar_em_copia_linux`). O Vite de screenshot que estava de pé foi derrubado.

### Como retomar
1. Ler este §11. 2. As 3 decisões JÁ FORAM RESPONDIDAS ("sim nos três") — não perguntar de novo.
3. Implementar 1→4, fotos DEPOIS nos 4 tamanhos, E2E, validar e publicar.

## 12. Tarde (retomada ~13:15) — a tela de ponto virou o APLICATIVO "Ponto" (NO AR, `28b9d7d`)

**Pedido (§11) + decisões "sim nos três":** nome "Ponto" + relógio azul · tela cheia total · tela
sempre acesa com o app aberto. **Critério combinado (e conferido):** no tablet, em pé ou deitado,
cada tela do ponto aparece INTEIRA (sem rolar, sem cortar, sem botão por cima de outro); o
navegador lê o app "Ponto" só na tela de ponto; a pinça não dá zoom lá; aberto como app a tela
não apaga.

### O que mudou
- **App:** `public/ponto.webmanifest` (id/start_url/scope `/clock`, `display: fullscreen`, azul
  #2563eb, ícones 192/512 comum + "maskable"). O link do app entra SÓ enquanto a tela de ponto
  está aberta (`src/components/employee-clock/useAppDoPonto.ts`) — o painel continua site.
  - ⚠️ Sem `orientation` DE PROPÓSITO: com "any" o Chrome do Android ignora a trava de rotação
    do aparelho (tablet na parede giraria com um esbarrão). Sem ela, gira junto com o tablet.
  - ⚠️ Sem `viewport-fit=cover` DE PROPÓSITO: o aparelho mantém a tela fora do entalhe da câmera.
  - ⚠️ Convite automático de instalar SEGURADO (`beforeinstallprompt`): o celular pessoal dos
    funcionários não passa a ver "Adicionar Ponto à tela inicial". Instala-se pelo menu ⋮.
- 🔴 **Ícones:** os 3 PNGs antigos (favicon-16/32 e apple-touch-icon, de out/2025) eram TEXTO
  (base64 salvo como arquivo, e cortado) — nenhum aparelho abria. Refeitos + 4 novos pelo
  `scripts/gerar-icones-do-ponto.mjs` (o Chromium desenha o `favicon.svg`; rodar de novo se o
  desenho mudar). iPhone e "maskable" sem transparência.
- **Encaixe:** a letra-base da tela de ponto vai de 16px (celular: IGUAL a antes) a 20px (tablet
  10") pela largura/altura (`index.css`, `html.tela-ponto`); tudo em rem cresce junto — tecla da
  senha 66→82px no tablet 10", 73px no 7" deitado. Deitado (≥640px) o cabeçalho azul vai pro
  lado (`deitado:` no `tailwind.config`); no 1º acesso a explicação vai pra coluna azul, senão o
  "Próximo" saía da tela no 7" deitado (o teste pegou: 642px numa tela de 600).
- **Zoom** travado só no /clock (viewport `user-scalable=no` + `touch-action`), devolvido ao sair.
- **Tela acesa** (Screen Wake Lock) só aberto como app; pedida de novo quando a tela volta.
- 🔴 **Defeito ANTIGO achado pelo teste novo:** na câmera sem CPF (todas as larguras), o botão
  "Prefere digitar CPF e senha?" ficava EM CIMA do aviso — "Aproxime o rosto", "Identificando..."
  e "Não reconheci" não apareciam. O aviso sobe enquanto o botão está na tela.
- **Janelas por cima** (câmera bloqueada, erro/carregando das 3 câmeras, saída rápida, GPS/câmera
  bloqueados) rolam em vez de cortar (no celular deitado cortavam o título e o botão de CPF).
- **No app instalado** não há cadeado/endereço: "câmera/localização bloqueada" ensina o caminho
  pelo Chrome (⋮ → Configurações → Configurações do site). No navegador, o texto de sempre.
- Aviso e barra de confiança da câmera em rem (celular: mesmos px; no tablet a barra sobe junto).

### Validação
| O quê | Resultado |
|---|---|
| typecheck · lint (projeto inteiro) · build | 0 · 0 · limpo |
| Unit (133 arquivos) | **2.025 passaram**, 1 pulado (o de sempre); novos: `appDoPonto` (17), `iconesDoAppDoPonto` (6), `faceScanFrame` (+3) = 26 (1.999 → 2.025) |
| A/B unit | ícones antigos → "não é um PNG de verdade" |
| E2E novo `tests/128` (cliques reais, 6 tamanhos: tablet 800×1280/1280×800, 7" 600×1024/1024×600, celular 390×844/844×390) | **12/12**; no código antigo **10/10 VERMELHO** (aviso×botão em todos os tamanhos, senha que não cabia no 7" deitado, janela cortada no celular deitado, sem app, zoom 2x, tela apagando) |
| E2E regressão | 02, 23, 38, 62 (guardas), 79, 100-K, 101, 107, 127 (rosto de verdade, 9 passos) **verdes** |
| E2E que falham IGUAL no código antigo (provado A/B, não mexi) | 08 (4 casos) e 62 "GPS liberado" (2): criam gente SEM rosto em Caratinga → "Cadastre o rosto para bater ponto" (facial obrigatória ligada em produção); 78 e 80: digitam o CPF direto, mas Caratinga abre na câmera |
| CSS do build × CSS no ar | nenhuma regra do painel mudou; 7 acrescentadas, todas da tela de ponto |
| Produção (15:07) | index/JS/CSS/manifest/7 PNGs **idênticos byte a byte** ao build testado; tablet em pé/deitado: câmera pronta em 4–6s, aviso não encavala, app lido (tela cheia, 0 erro), pinça 1,00, 0 erro de página |
| Banco no fim | 0 funcionário/empresa/tablet/ponto de teste; trava do tablet DESLIGADA nas 2 empresas |
| CI do `28b9d7d` (run 36756235211) | **verde nos 3 jobs** às 15:18: tsc+eslint, vitest (unit, com os testes ao vivo das edge fns), playwright (e2e) |

⚠️ Uma vez rodei a bateria unit JUNTO com a regressão B — contra a decisão de 20/07 ("nunca em
paralelo com Playwright", carga = flake). Não interferiu: as 2 falhas daquela rodada (78/80)
repetiram sozinhas, iguais, no código antigo, e o resto passou. Não repetir.

### ⚠️ Lição (memória nova `reference_teste_08_mexe_na_cerca_real`)
O `tests/08` troca a cerca REAL de Caratinga (`geolocation_config`, que o servidor usa) por ~3 min
e só devolve no fim. Rodei 2x hoje sem saber; conferido: zero ponto fora do raio, zero fraude de
localização e zero bloqueio de bônus reais no dia; a cerca voltou a -19.8024282/-42.1361237/150.

### Precisa do Victor
1. **Instalar no tablet** (passo a passo na resposta da sessão): Chrome → endereço do sistema +
   `/clock` → ⋮ → **Instalar app** → abrir pelo ícone azul "Ponto" → permitir câmera e localização
   na 1ª vez → (se for usar a trava) "Ativar este aparelho como tablet de ponto" com o código do 2626.
2. **Decidir** se atualizo os testes 08/62/78/80 (hoje falham por estarem desatualizados; o 08
   ainda mexe na cerca real — o certo é refazer em empresa de teste).
3. Pendências de antes continuam: trocar a senha da aba Admin (§10), ligar a trava quando quiser
   (§9), recadastrar 3 rostos "no limite" (§9).

## 13. Noite — os testes desatualizados refeitos numa EMPRESA DE TESTE (`c8e8d5d`)

**Victor:** *"sim pode com cuidado"* (§12, item 2 do "Precisa do Victor").

- **08 (4 casos) e 62 "com GPS liberado" (2):** batiam ponto com funcionário SEM rosto em
  Caratinga (facial obrigatória) → o servidor recusava; o mock da tela só engana o navegador. E o
  08 TROCAVA a cerca real de Caratinga por ~3 min a cada rodada. Agora batem numa empresa nova, só
  do teste, com a MESMA cerca de antes (08: centro VALID_LAT/LON, raio 200; 62: ponto do CD, raio
  150) e sem facial obrigatória.
- **78 e 80:** digitavam o CPF direto no /clock (Caratinga abre na câmera). Agora a empresa de
  teste (que abre no CPF) recebe os cadastros; o 2626 a escolhe no login; o /clock passa pelo
  `irAoCampoDeCpfDoPonto`. O 78 cria na empresa uma pessoa com "Triagem - Shopee" pro <select>
  da página pública oferecer a função.
- **Auxiliares novos** (`tests/integrity-helpers.ts`): `criarEmpresaDeTeste` / `apagarEmpresaDeTeste`
  — este RECUSA empresa sem "PW Test " no nome e deixa o erro subir se sobrar algo ligado a ela (as
  tabelas com company_id têm FK sem cascata: nada fica órfão em silêncio). `loginAs(..., { empresa })`
  e `createTestEmployee({ companyId })` — aditivos, sem o parâmetro fica igual antes.

### Validação
| O quê | Resultado |
|---|---|
| Os 4 specs refeitos | **10/10** (antes: 8 vermelhos, iguais no código antigo) |
| Amostra do login padrão (01 + 127) | 13/13 |
| lint (projeto inteiro) | 0 |
| Config real de Caratinga/Ponte Nova (md5 de empresas + cercas + facial + nº de funcionários) | **idêntica** antes × depois (`5479a3e7…`) |
| Banco no fim | 0 empresa / funcionário / semana de pagamento / ponto de teste; 0 fraude de localização real no dia |
| CI do `c8e8d5d` (run 36791057396) | **verde nos 3 jobs** às 20:39: tsc+eslint, vitest, playwright (e2e) |

### ⏸️ 20:36 — PAUSA (Victor vai reiniciar o PC)
Tudo commitado e enviado (`28b9d7d` app no ar, `c8e8d5d` testes, checkpoints). Nada rodando que
dependa do PC (servidor de teste desligado; o CI roda no GitHub). **CI do `c8e8d5d` VERDE** (20:39, conferido antes do reinício) —
nada a conferir na volta. Pendências dele: instalar o app no tablet (§12),
trocar a senha da aba Admin (§10), ligar a trava quando quiser (§9), 3 rostos "no limite" (§9).

## 14. Noite (~21:45, depois do reinício) — contagem 3s → 2s (NO AR, `5c0ea54`) + investigação do roadmap item 5

**Victor:** *"poe fazer os dois"* — (A) baixar a contagem com o nome de 3s pra 2s (§9 item 5) e (B)
roadmap item 5 "fora da empresa o funcionário só vê os próprios erros".

### A — contagem 2s (feito)
- `FaceIdentifyClock.tsx`: `CONFIRM_COUNTDOWN_SECONDS = 2`. Nome na tela e "Não sou eu" continuam.
- 2 testes novos em `facialSemCpfNaoTrava.spec.tsx` (começa em 2s, não grava antes, grava logo
  depois; "Não sou eu" impede). 🔴 **A 1ª versão do teste passava com 3s também** (esperava o texto
  "em 2s", que na contagem de 3s aparece 1s depois do nome) — o A/B pegou; agora mede a partir do
  NOME. A/B final: com 3s falha ("em 3s"), com 2s passa.
- Validação: typecheck 0 · lint 0 · build limpo · unit **2.027** (133 arquivos, 12 lotes, 0 worker
  morto) · E2E 127 (rosto de verdade) + 128 **38/38** (chromium + pixel5; firefox/webkit pulam de
  propósito) · nome → ponto gravado **2,9s** (antes 3,4s — caiu 0,5s, não 1s: o resto é GPS/servidor
  que já corriam junto com a contagem) · banco limpo (0 empresa de teste, 0 tablet, trava desligada
  nas 2) · produção: `index-6Io_VlZ8.js` **idêntico byte a byte** ao build testado · **CI do `5c0ea54` (run 36800599886) verde nos 3 jobs**.

### B — o que a investigação achou (nada programado ainda; plano entregue ao Victor)
- **`/erros` já existe** (desde 21/04): CPF + PIN → só os erros por período + recibos publicados.
  Funciona de qualquer lugar, sem GPS.
- Celular pessoal no `/clock`: com a trava DESLIGADA (hoje) entra e vê painel do dia + resumo do
  mês + 30 dias; com a trava LIGADA cai em "Ponto só no tablet da empresa" — **sem caminho pros
  erros** nessa tela.
- 🔴 **Servidor:** `employee-errors-by-period`, `employee-error-periods`, `today-attendance` e
  `attendance-history` **não pedem PIN** — só o id, que `lookup-employee` entrega com o CPF. Ou
  seja: com o CPF de alguém dá pra ver os erros (e o ponto com lat/long) dele. Recibos já pedem PIN
  (63eaf04).

## 15. Madrugada 01/10 — roadmap item 5 PROGRAMADO, NÃO commitado (parado em 2 pontos do Victor)

**Decisões do Victor (não re-perguntar):** (1) fora do tablet *"pode ver tudo mas não bater o ponto
de forma nenhuma se não tiver liberado"* — erros + recibos + PONTOS; (2) o caminho da consulta
aparece *"fora do tablet"*; (3) *"sim"* pra fechar a brecha do servidor.

**O que está na árvore (sem commit):**
- `_shared/acessoDoFuncionario.ts`: COMPROVANTE FACIAL (HMAC, 15 min, por pessoa+empresa) que
  `identify-face` devolve ao reconhecer — no tablet não há PIN, o rosto vira a senha.
- `employee-public-api`: today-attendance, attendance-history e os 2 de erros conferem PIN OU
  comprovante. **Troca em 2 passos** (`EXIGIR_PROVA_DO_FUNCIONARIO = false`): prova errada já é
  401; prova AUSENTE ainda passa e fica no log como `[prova-ausente] <ação>` — porque a facial sem
  CPF roda todo dia em Caratinga em telas ABERTAS com o código velho (exigir de uma vez travaria a
  batida na porta). Passo 2 = virar true quando o log zerar (+ `EXIGINDO_PROVA` no teste ao vivo).
- Tela: `/clock` manda PIN ou comprovante; `/erros` ganhou "Meus pontos" (`MeusPontos.tsx`, saiu do
  EmployeeClockIn) e manda o PIN; link "Ver meus erros, pontos e recibos" no CPF e no aparelho
  barrado, só quando NÃO é tablet. 🔴 Defeito antigo consertado: falha ao buscar os erros mostrava
  "Nenhum erro registrado — continue assim!".
- `clockOut` (database.ts) é código morto (ninguém chama) — só recebeu o parâmetro; avisar.

**Validação:** typecheck 0 · lint 0 · build · deno check ok · unit 2.046 (136 arq.) — as 2 falhas
são `edgeFnConsultaComProva` contra o servidor AINDA velho (A/B: PIN errado devolve 200 hoje) ·
A/B front: 6 testes novos vermelhos no código antigo · E2E 128/31/109 verdes; **127: o passo 5b
novo falhou por erro MEU no teste** (esperei a linha de hoje sem "--:--:--", mas a SAÍDA só é batida
no passo 6 — a tela está certa: entrada 00:06:52, saída vazia). Passos 6–9 não rodaram por isso.
Banco limpo, trava desligada nas 2.

**Parado esperando o Victor:** (a) liberar a publicação da edge fn (o classificador do Claude Code
bloqueou o deploy em produção — versão no ar v19, conferida IGUAL ao HEAD antes); (b) OK pra
corrigir a asserção do 5b (conferir a ENTRADA preenchida em vez de "nenhum --:--:--").
**Ordem quando liberar:** deploy → `edgeFnConsultaComProva` ao vivo → E2E 127 inteiro → commit +
push do código → CI → checkpoint. Depois de 1–2 dias: log sem `[prova-ausente]` → passo 2.

## 16. 01/10 madrugada/manhã — item 5 + ATUALIZAÇÃO AUTOMÁTICA NO AR (`c5261b2`)

**Victor:** *"sim para os dois"* — (a) liberou o deploy da edge fn + OK pra corrigir a asserção do
5b; (b) fazer a atualização automática.

### Relato do Washington (01/10 02:08, iPhone/Safari) — causa provada
"Erro na verificação — Não foi possível acessar a câmera" → "Reconhecimento facial falhou. Procure o
supervisor". **Não era câmera:** o texto só existe no código de ANTES de `eba2e45` (30/09 09:48) — o
Safari manteve a aba velha. A tela velha pedia `face-descriptor` sem PIN; desde a v19 (30/09 10:46)
o servidor exige → 401 às **02:08:12** (log da edge fn) → o código antigo chamava qualquer falha de
"câmera". Outras 401 reais prováveis: 30/09 11:31 (5x) e 14:00 (2x). Washington sem ponto em 01/10
(decisão do Victor lançar). Não reproduzido localmente com o código velho — prova = log + texto.

### Entregue (no ar)
- edge fn `employee-public-api` **v20** (deploy com OK; baixada e conferida = repo, 5 arquivos).
  Passo 1: prova ERRADA → 401; AUSENTE passa e loga `[prova-ausente]`.
- Atualização automática (`useAtualizacaoAutomatica` + `/version.json` por build, sem cache):
  /clock e /erros recarregam sozinhas quando sai versão nova, só com a tela livre (sem CPF
  digitado, câmera sem ninguém sendo reconhecido); 1x por versão e 1x a cada 2 min (o E2E pegou
  círculo com etiqueta instável — erro do meu teste, mas a trava ficou). ⚠️ Quem JÁ tem tela velha
  aberta precisa recarregar à mão UMA vez; daí em diante atualiza sozinho.
- Produção conferida: version.json `c5261b268c8f-…` (JSON, no-store) = etiqueta dentro do bundle
  `index--Trucr4R.js`, que tem o link da consulta e o comprovante.

### Validação
typecheck 0 · lint 0 · build · deno check · unit **2.056** (137 arq., 0 falha) · edge fn ao vivo
17/17 · E2E 127/128/31/109/130 **31/31** (nome→ponto 2,3s) · A/B: 6 de tela + 3 do servidor
(contra a v19) + 3 do E2E 130 vermelhos no código antigo · banco limpo, trava desligada nas 2 ·
**CI do `c5261b2` (run 36849875196) verde nos 3 jobs**.

### Pendências
1. **Passo 2** (exigir prova sempre): quando o log da edge fn ficar sem `[prova-ausente]` — virar
   `EXIGIR_PROVA_DO_FUNCIONARIO = true` + `EXIGINDO_PROVA = true` no teste ao vivo, deploy (pedir OK).
2. Avisar o pessoal: quem tiver a tela de ponto aberta há dias, recarregar uma vez.
3. Ponto do Washington em 01/10 (lançar à mão, decisão do Victor). `clockOut` = código morto (avisado).

### 01/10 08:15 — ponto do Washington lançado (ordem do Victor: "a mesma média do pessoal")
Entrada **02:12** (média dos 17 de Caratinga que entraram 00:00–04:30 em 01/10), `clock_source
manual`, `marked_by 2626`, INSERT direto como postgres (o gatilho `enforce_ponto_master_only` libera
postgres). Saída EM ABERTO: o turno não tinha acabado (1 de 17 saiu) — ele bate a saída normal
depois de recarregar a tela; se não bater, lançar a saída pela média do turno quando fechar.
