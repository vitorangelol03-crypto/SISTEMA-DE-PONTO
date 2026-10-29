# Checkpoint — Sessão 2026-10-29

## Vídeo tutorial do app do entregador ("Meus Pagamentos") — ENTREGUE

**Pedido do Victor:** vídeo simples e completo ensinando os drivers a usar o app (`/driver`),
do login até anexar as notas (print da Shopee, ver espelho etc.), com **dados de mentira**,
"bem profissional", "nada robotizado", sem ficar grande demais.

### Decisões do Victor (29/10 — não re-perguntar)
- **Voz feminina** + legenda grande. Mandei amostra A (Francisca) × B (Thalita Multilingual);
  sem resposta → **B** (avisei que seria o padrão). Trocar = rodar `tts.py` com a outra voz.
- **Vertical (celular/WhatsApp)**, 1080×1920.
- **Extras que entram:** "se der errado" (print recusado + nota recusada) e "líder de grupo".
  **Fora:** dividir a nota em 2 (só pra habilitados; vídeo à parte se ele quiser).
- **Mostra "CD Logística"** na abertura e o **endereço** `sistema-ponto-zeta.vercel.app/driver`.

### Entregue
- `C:\Users\VICTOR\Downloads\Tutorial - App Meus Pagamentos.mp4` — 1080×1920, 30 fps,
  **3min41s**, H.264 + AAC, 40 MB.
- `C:\Users\VICTOR\Downloads\Tutorial - App Meus Pagamentos (WhatsApp).mp4` — 720×1280,
  15,1 MB (cabe no limite de 16 MB sem o WhatsApp recomprimir e borrar).
- Roteiro: abertura → "São só 4 passos" → 1 Entrar (link, CPF, senha 1234, criar senha, tela
  inicial) → 2 Print da Shopee (como tirar no app da Shopee, botões laterais, certo×errado, enviar,
  "Analisando…", "Tudo enviado!") → print recusado → líder de grupo → 3 Espelho (Ver, lupa no
  prazo, pacotes, faixa verde, faixa amarela eMile, Baixar) → 4 Nota (cartão = nota + CNPJ, faixa
  verde → Shopee/Anjun/Loggi, faixa amarela → iMile, só PDF, enviar, "Nota enviada") → nota
  recusada → Sair → resumo → "Fale com a CD".

### Como foi feito (sem tocar produção)
- **App real** (código do `main` `4ae2d19`) numa cópia Linux `~/projetos/ponto-video` (Vite 5199),
  gravado com Playwright em modo celular 3x. **Servidor de mentira**: toda chamada à
  `driver-public-api` respondida pelo script; as 7 leituras de painel que o `App` dispara mesmo no
  `/driver` foram **barradas e logadas** → **nenhuma chamada chegou ao Supabase real**.
- Espelho PDF gerado pelo **gerador real** (`generateDriverMirrorPdf`) com dados falsos
  (Carlos Eduardo Souza, 1ª quinzena de outubro, total R$ 1.889,00 + eMile R$ 336,00 separado,
  CNPJs fictícios). Conta da nota conferida no código: faixa verde = nota do CNPJ
  Shopee/Anjun/Loggi; faixa amarela (eMile) = nota do CNPJ iMile (mesma regra do `mirrorBands`).
- Banco: **só leitura** (SELECT) pra copiar o formato real — rótulos dos emissores
  ("iMile", "Shopee/Anjun/Loggi"), CNPJ formatado, plataforma do print = "SHOPEE", textos de recusa.
- Voz: edge-tts (Thalita), tempo por palavra sincroniza mão, legenda (karaokê) e cortes.
  **Pronúncia conferida com faster-whisper**: "Shopee" só soa certo escrito "Shópi" (pra voz);
  iMile → "Ai-mail"; Loggi → "Lógui"; "toque em Ver" no fim da frase vira "vê" → frase trocada.
- Montagem: composer HTML quadro a quadro (câmera com zoom, mão animada, realces, lupa no PDF,
  selo "DADOS DE EXEMPLO") → 6.644 quadros; áudio = voz + efeitos (toque, teclas, "plim", clique)
  + trilha **sintetizada aqui** (sem música de terceiros) que abaixa sob a voz; **-16 LUFS**.
- **Fontes guardadas** em `~/projetos/video-tutorial-driver/` (scripts/, composer/, capture/, audio/)
  pra refazer/atualizar sem começar do zero. ffmpeg via `pip install imageio-ffmpeg`.

### Validação
- Cada fala transcrita isolada (49/49) + pronúncia das marcas testada em variantes.
- Quadros revisados cena a cena (folhas de contato) antes e depois dos ajustes; quadros extraídos
  do **MP4 final** conferidos; versão WhatsApp conferida legível (CPF, prazo ampliado, legenda).
- Áudio do MP4 final (voz + trilha + efeitos juntos) transcrito com faster-whisper e comparado fala
  a fala com o roteiro: **49/49 falas presentes e no lugar certo** (47 bateram direto; as 2 marcadas
  eram alarme falso — "1-2-3-4" escrito em número e "Resumindo" isolado; com contexto o transcritor
  ouve "Resumindo, entre com seu CPF e a sua senha."). Mix: -16,0 LUFS, pico -3,4 dBTP.
- Cópias no Downloads conferidas por md5 (idênticas).

### Observação (NÃO mexido — só aviso)
- No app real, a **nota recusada** mostra `Motivo: [automático] O valor da nota ... valor certo..`
  (etiqueta interna + ponto duplicado). O cartão do **print** já tira o `[automático] `; o da nota
  não. No vídeo o motivo aparece limpo. Ajuste de 1 linha no `DriverApp.tsx` se o Victor pedir.

## Parte 2 — versão "um CNPJ só" (pedido do Victor no mesmo dia)

**Pedido:** "faça um sem essa peculiaridade do eMile — nem toda empresa tem a configuração do CNPJ
separado; foca na Shopee e nas outras plataformas dentro do mesmo CNPJ; mesmo formato, tudo
idêntico". Interpretei o fim do áudio ("tem que ter dois CNPJ") como "não tem que ter" (o resto do
pedido inteiro é tirar o 2º CNPJ) e avisei a interpretação no chat.

**O que muda em relação ao 1º vídeo** (o resto é idêntico, mesmo código com `?perfil=simples`):
- Espelho de exemplo sem eMile: SHOPEE + LOGGI, desconto, **TOTAL A RECEBER R$ 1.889,00** (faixa
  verde) — sem faixa amarela nem "AVISO EMILE" (gerado pelo mesmo `generateDriverMirrorPdf`).
- "Anexar nota" com **um cartão só** ("Shopee", CNPJ fictício); sem a 2ª nota.
- Falas novas: `esp4s` "…É esse o valor da sua nota", `nf2s` "Esse cartão é a sua nota…",
  `nf3s` "A nota leva o valor da faixa verde…", `res5s` "anexe **a** nota" (singular). Saem `esp5`
  (eMile) e `nf7` (outro cartão). Lupa da faixa verde: "Total a receber = valor da nota".
- Duração **3min28s** (47 falas).
- Arquivos separados: `assets-simples/`, `capture-simples/` (63 telas, de novo nenhuma chamada ao
  Supabase real), `frames-simples/`, `timeline-simples.json`, `audio/mix-simples.wav`.
- Tropeço resolvido: com o robô do shopee-bot (outro projeto, PM2) usando CPU ao mesmo tempo, 6
  páginas do composer não carregavam a tempo (cada uma decodifica ~100 telas 3x) → render com 3
  páginas e espera de carregamento maior. Robô NÃO foi tocado.

**Entregue (versão Shopee):**
- `C:\Users\VICTOR\Downloads\Tutorial - App Meus Pagamentos (versão Shopee).mp4` — 1080×1920,
  3min28s, 36,5 MB.
- `C:\Users\VICTOR\Downloads\Tutorial - App Meus Pagamentos (versão Shopee - WhatsApp).mp4` —
  720×1280, 15,1 MB (também enviado ao celular do Victor).
- O 1º vídeo (dois CNPJs) continua no Downloads para empresas que usam a configuração do eMile.

**Validação (versão Shopee):** 4 falas novas transcritas isoladas (certas); quadros das cenas que
mudaram revisados antes do render e extraídos do MP4 final (espelho sem faixa amarela, 1 cartão,
"Anexe a nota"); áudio do MP4 final transcrito: **47/47 falas no lugar** (as 2 marcas automáticas
eram os mesmos alarmes falsos do 1º vídeo, conferidos com contexto). Mix -16,0 LUFS. Cópias no
Downloads conferidas por md5.

### Estado ao fim
- Zero código do sistema alterado; zero escrita no banco. Servidores locais do vídeo (5199/5288)
  encerrados no fim da sessão.

## Fechamento da sessão (29/10, "faça um checkpoint, vou fechar o terminal")

- **Commits (só docs, `[skip ci]`, enviados ao `main`):** `78b277f` (vídeo 1) → `7ba1363` (versão
  Shopee) → este fechamento. Nenhum commit de código.
- **Banco (produção):** só leituras (SELECT) pra copiar formato real. Nada gravado.
- **Fora do repo:**
  - `C:\Users\VICTOR\Downloads\`: `Tutorial - App Meus Pagamentos.mp4` (+ `(WhatsApp)`) = versão
    **dois CNPJs (com eMile)**; `Tutorial - App Meus Pagamentos (versão Shopee).mp4` (+
    `(versão Shopee - WhatsApp)`) = versão **um CNPJ só**. As duas de WhatsApp foram enviadas ao
    celular do Victor.
  - Fontes pra refazer/atualizar: `~/projetos/video-tutorial-driver/` (tem `LEIA-ME.txt` com os
    passos). Cópia do app usada na gravação: `~/projetos/ponto-video` (pode ser reaproveitada).
  - Rascunhos/quadros da sessão ficaram só no scratchpad (/tmp) — descartáveis.
- **Pendências que nasceram aqui (nenhuma bloqueia):**
  1. Voz B (Thalita) foi escolhida por padrão — Victor não respondeu A×B. Trocar = `tts.py` com
     `pt-BR-FranciscaNeural` + render/mix/montar (passos no LEIA-ME).
  2. Aviso do app real: nota recusada mostra "Motivo: [automático] …" + ponto duplo (1 linha no
     `DriverApp.tsx`, só se ele pedir).
  3. Se ele quiser: vídeo à parte do "dividir a nota em 2" (ficou fora por decisão dele).
- **Pendências antigas seguem as mesmas** (ver blurbs do índice): decisões ANJUN, espelho do Mário,
  layout "Nomes autorizados a emitir nota", modo galpão no tablet real, 4 decisões de taxas de
  09/10, senha da aba Admin, folha sem salário (18 pessoas), tabela INSS/IRRF 2026.
