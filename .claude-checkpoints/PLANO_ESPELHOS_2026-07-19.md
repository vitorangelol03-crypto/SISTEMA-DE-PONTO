# PLANO — 4 implementações dos espelhos (2026-07-19)

> Aprovado pelo Victor em conversa (migrations autorizadas; decisões registradas).
> Execução SÓ após a prova final F8 (HMR do Vite contaminaria a bateria em curso).
> Regra de ouro: espelho continua PROFISSIONAL — padrão visual atual preservado;
> print de cada espelho gerado vai pro Victor aprovar antes de dar por pronto.

## Decisões do Victor (fechadas)
1. Migrations autorizadas (2 arquivos).
2. Destaque: VÁRIAS plataformas simultâneas, conforme configurado.
3. Aviso de corte: sai SEMPRE, sem checkbox.
4. Aviso de plataforma: ACOPLADO ao destaque; com SETAS ligando aviso→coluna/linha.
5. REGRA DE PRESENÇA: destaque+aviso só aparecem em espelho que TEM pacotes>0
   daquela plataforma (ex.: driver só com eMile/ANJUN não vê nada da SHOPEE).
6. Descontos no grupo: limite 12 linhas, agrupado por driver (recomendação aceita
   por silêncio — trivial de mudar).

## Arquitetura (por que é seguro)
Todos os 4 tipos de espelho (individual/grupo/massa/seleção) passam pelo MESMO funil:
builders (`driverPayShared.ts`) → `MirrorRequest` → `DriverMirrorPreviewDialog` →
`driverMirrorPdf.ts` (jsPDF + autoTable). Mexendo no funil, os 4 tipos herdam junto.
autoTable suporta nativamente: cor por célula/coluna (`didParseCell`) e captura de
posição x/y de célula (`didDrawCell`) → coluna amarela + setas SEM gambiarra.

## Migrations (2 arquivos, aditivas)
- `..._driverpay_platform_mirror.sql`:
  `ALTER TABLE driverpay_platforms ADD COLUMN highlight_mirror boolean NOT NULL DEFAULT false,
   ADD COLUMN mirror_notice text;` (RLS e grants da tabela JÁ cobrem — conferido hoje).
- `..._driverpay_mirror_cutoff.sql`:
  `CREATE TABLE driverpay_mirror_notice (company_id uuid PRIMARY KEY REFERENCES companies(id)
   ON DELETE CASCADE, cutoff_time text NOT NULL, cutoff_date text NOT NULL,
   late_payment_date text NOT NULL, updated_by text, updated_at timestamptz DEFAULT now());`
  + RLS idêntica ao padrão driverpay (company_id do JWT OR sub in 9999/2626) + grants.

## Toques por arquivo (mapa completo)
| Arquivo | Mudança |
|---|---|
| `services/driverPay.ts` | `DriverPlatform` +2 campos; `mapPlatform` +2; whitelist do `updatePlatform` +2; novos `getMirrorCutoffNotice`/`saveMirrorCutoffNotice` (upsert) |
| `utils/driverMirrorGenerator.ts` | `DriverPlatformLine` + `highlight?/notice?`; `DriverDiscountLine` + `status?` ('PNR'\|'LOST'\|null) |
| `components/driverpay/driverPayShared.ts` | `buildDriverMirrorData`: anexa highlight/notice por plataforma (presença AUTOMÁTICA: o array platforms já filtra packages>0) e `status` nos discounts |
| `utils/driverMirrorPdf.ts` | novas cores (amarelo yellow-200 destaque; banda de aviso); `drawCutoffBand` (faixa corte, toda página); `drawPlatformNoticeBands` (≥2 posições + setas via didDrawCell); coluna amarela no grupo (`didParseCell` idx da coluna); linha amarela no individual; seção "DESCONTOS DO GRUPO" (autoTable mesmo estilo, 12 + "e mais X", agrupado por driver, só se houver) |
| `components/driverpay/DriverMirrorPreviewDialog.tsx` | 3 campos do corte (pré-carregados; salvam no Gerar); espelhos-preview HTML com faixa de corte, destaque amarelo, avisos c/ nome da plataforma e seção de descontos (paridade com o PDF) |
| `components/driverpay/PlatformModal.tsx` | form de EDIÇÃO ganha toggle "Destacar no espelho 🟡" + campo "Aviso da plataforma" |

## ⚠️ Riscos mapeados + mitigação
1. **Builder duplicado**: `driverMirrorGenerator.ts` TAMBÉM tem um builder de mirror-data
   (linha ~231) além do `driverPayShared`. VERIFICAR consumidores na execução — atualizar
   AMBOS ou provar que um está morto (não deixar caminho gerando espelho sem os campos).
2. **E2E poluindo config real**: specs que clicam "Gerar PDF" (54/58/59 + novos) passarão a
   SALVAR o corte na config da Caratinga real → specs fazem snapshot/restore da linha
   `driverpay_mirror_notice` via service role (helper no cleanup.ts).
3. **Overflow de página** (grupo grande + avisos + descontos): `ensureSpace` já pagina;
   teste com grupo de muitos descontos incluído no E2E.
4. **Zebra × célula amarela** no autoTable: `didParseCell` tem precedência sobre
   alternateRowStyles (confirmar visualmente no print).
5. **Plataforma arquivada** destacada: gate por `active` (arquivada não destaca nem avisa).
6. **Spec 54** (extrai texto do PDF): asserts frouxos (R$/0,00/sem corrompido) — layout novo
   não quebra; rodar mesmo assim na regressão.
7. **Prévias HTML × PDF divergirem**: implementar os dois lados na MESMA feature-branch de
   commit e conferir no print (paridade é parte do critério de pronto).

## Ordem de execução (após F8)
1. Migrations (2) via MCP + registrar em `supabase/migrations/`.
2. Tipos + serviço (driverPay.ts) → tsc.
3. Feature 1+4 juntas (destaque+aviso: mesmos arquivos) → unit → E2E → print pro Victor.
4. Feature 2 (corte) → unit → E2E (com snapshot/restore) → print.
5. Feature 3 (descontos no grupo) → unit → E2E (desconto PNR em quinzena descartável) → print.
6. Regressão: specs 54/57/58/59 + suíte unit completa + build.
7. Commits por feature; deploy só com OK do Victor nos prints; checkpoint.

## Critérios de sucesso (1 frase cada)
1. Marco SHOPEE 🟡 → coluna/linha amarela em todo espelho que tenha pacote SHOPEE — e só neles.
2. Gero espelho hoje com 14:00/20/07/27/07 → amanhã os campos vêm preenchidos; faixa em todo espelho.
3. Grupo com desconto → 1ª página lista driver+código+PNR/LOST+obs+valor (máx 12 + "e mais X").
4. Aviso da SHOPEE aparece grande, 2×, com seta pra coluna — e só onde SHOPEE existe.
