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

### Estado ao fim
- Zero código do sistema alterado; zero escrita no banco. Servidores locais do vídeo (5199/5288)
  encerrados no fim da sessão.
