import React, { useMemo, useState } from 'react';
import { Download, Loader2, FileSpreadsheet } from 'lucide-react';
import { ModalShell } from './ModalShell';
import { formatBRLIf, type AlreadyDeductedDriver, type ChecksFilterOptions, type ChecksFilterResult } from './driverPayShared';
import { descontosPendentes, totalPendente } from '../../utils/descontoPendente';
import {
  resumoDesconto, abaterAgora,
  type ModoDesconto, type PessoaDesconto,
} from '../../utils/descontoSaldo';

/** Escolhas do operador na hora de baixar o relatório. */
export interface ReportOptions {
  /** Plataformas escolhidas; null = todas (relatório completo, como sempre foi). */
  allowed: string[] | null;
  /**
   * Como descontar vale/perda (07/08/2026, decisão do Victor). O padrão é `pendentes`:
   * decide PESSOA POR PESSOA, pra pagar por plataforma sem cobrar duas vezes.
   */
  modoDesconto: ModoDesconto;
  /**
   * Derivado do modo, pra tudo que já existia continuar funcionando (o cabeçalho do
   * arquivo e a marca de pagamento): false só no modo `nenhum`.
   */
  includeDeductions: boolean;
  /**
   * Quanto abater de cada driver, decidido pela regra de saldo. Vazio no modo `nenhum`.
   * É o que vira lançamento no livro-caixa depois que o arquivo é gerado.
   */
  deductionByDriver: Map<string, number>;
  /** Só quem está com o botão "Espelho conferido" marcado. */
  onlyEspelhoConferido: boolean;
  /** Só quem está com a nota validada (mesma regra da coluna NF da lista). */
  onlyNfValidada: boolean;
  /** Só quem mandou a nota dentro do prazo do espelho dele. */
  onlyNfNoPrazo: boolean;
  /** Esta planilha É o pagamento: quem sair nela fica com a tag "pago". */
  marcarComoPago: boolean;
  /** Entregadores tirados do relatório na hora (já pagos que o operador removeu). */
  excluirDriverIds: string[];
}

interface ReportOptionsModalProps {
  /** 'geral' = relatório detalhado por rota/plataforma; 'simples' = nome · valor · PIX · obs. */
  kind: 'geral' | 'simples';
  /** Nomes das plataformas disponíveis no período (ordem das colunas). */
  platformOptions: string[];
  /** Total de vales+perdas no escopo do relatório (0 esconde o botão de descontar). */
  deductionsTotal: number;
  /** Quem já teve vale/perda abatido numa publicação deste período (aviso anti-duplo). */
  alreadyDeducted: AlreadyDeductedDriver[];
  /** Nº de recebedores/drivers no escopo (só informativo no cabeçalho). */
  scopeLabel: string;
  /** Quem sai do relatório com os filtros de conferência marcados (prévia honesta). */
  checksPreview: (opts: ChecksFilterOptions) => ChecksFilterResult;
  /**
   * Quem, neste relatório, JÁ foi pago naquelas plataformas — com a data. Recalculado
   * conforme o operador mexe nas plataformas e tira gente da lista.
   */
  jaPagos: (allowed: string[] | null, excluirDriverIds: readonly string[]) =>
    Array<{
      driverId: string; name: string; platformName: string; paidAt: string;
      deductionsApplied?: boolean | null;
      /** Vales + perdas dele na quinzena (05/08/2026) — o aviso de pendência precisa saber
          se existe o que descontar; sem isso ele listava quem não deve nada. */
      valeOuPerda?: number;
    }>;
  /**
   * Quem está no escopo do relatório, do ponto de vista do desconto (07/08/2026): quanto
   * cada um deve, quanto já foi abatido dele (livro-caixa) e quanto ele recebe NAS
   * plataformas escolhidas. Recebe exatamente os mesmos filtros que o arquivo vai usar,
   * pra prévia e arquivo nunca discordarem.
   */
  pessoasDesconto: (
    allowed: string[] | null,
    excluirDriverIds: readonly string[],
    checks: ChecksFilterOptions,
  ) => PessoaDesconto[];
  onClose: () => void;
  onConfirm: (opts: ReportOptions) => Promise<void>;
  /** Ver valores em R$ (02/09/2026) — false esconde os totais/valores desta janela. */
  canViewValues: boolean;
}

/**
 * Uma linha da prévia do desconto: quantos, quanto, e os nomes a um clique.
 *
 * Os nomes ficam fechados de propósito — a faixa antiga despejava 25 nomes na cara e o
 * número, que é o que decide, se perdia no meio.
 */
const ResumoLinha: React.FC<{
  testid: string;
  cor: string;
  texto: string;
  valor: number;
  nomes: ReadonlyArray<{ driverId: string; name: string; valor: number }>;
  canViewValues: boolean;
}> = ({ testid, cor, texto, valor, nomes, canViewValues }) => (
  <details className="text-xs" data-testid={testid}>
    <summary className={`cursor-pointer ${cor}`}>
      <b>{texto}</b> — {formatBRLIf(valor, canViewValues)}{' '}
      <span className="text-gray-500 font-normal">(ver nomes)</span>
    </summary>
    <p className="mt-1 ml-4 text-gray-600">
      {nomes.map((n) => `${n.name} (${formatBRLIf(n.valor, canViewValues)})`).join(', ')}.
    </p>
  </details>
);

/**
 * Janela de opções dos relatórios (2026-07-27, decisões do Victor):
 *  - chips de PLATAFORMA (todas marcadas = relatório completo de sempre);
 *  - botão "Descontar vales e perdas" (marcado por padrão) pro pagamento parcial;
 *  - aviso quando alguém do escopo já teve o desconto abatido num espelho publicado.
 */
export const ReportOptionsModal: React.FC<ReportOptionsModalProps> = ({
  kind,
  platformOptions,
  deductionsTotal,
  alreadyDeducted,
  scopeLabel,
  checksPreview,
  jaPagos,
  pessoasDesconto,
  onClose,
  onConfirm,
  canViewValues,
}) => {
  const [selected, setSelected] = useState<Set<string>>(() => new Set(platformOptions));
  /**
   * Padrão `pendentes` (07/08/2026): decide pessoa por pessoa. Era tudo-ou-nada, e as duas
   * posições erravam ao pagar por plataforma — marcado cobrava em dobro de quem já tinha
   * sido descontado, desmarcado deixava sem desconto quem nunca foi.
   */
  const [modoDesconto, setModoDesconto] = useState<ModoDesconto>('pendentes');
  const includeDeductions = modoDesconto !== 'nenhum';
  // Desmarcados por padrão: sem tocar em nada, o arquivo sai igual ao de sempre.
  const [onlyEspelhoConferido, setOnlyEspelho] = useState(false);
  const [onlyNfValidada, setOnlyNf] = useState(false);
  const [onlyNfNoPrazo, setOnlyPrazo] = useState(false);
  /** "Esta planilha é o pagamento de verdade" — desmarcado por padrão: marcar é ato consciente. */
  const [marcarComoPago, setMarcarComoPago] = useState(false);
  /** Já pagos que o operador TIROU do relatório aqui mesmo, sem sair da tela. */
  const [excluidos, setExcluidos] = useState<Set<string>>(new Set());
  const [generating, setGenerating] = useState(false);

  const preview = useMemo(
    () => checksPreview({ onlyEspelhoConferido, onlyNfValidada, onlyNfNoPrazo }),
    [checksPreview, onlyEspelhoConferido, onlyNfValidada, onlyNfNoPrazo],
  );
  const algumFiltro = onlyEspelhoConferido || onlyNfValidada || onlyNfNoPrazo;
  const foraPorMotivo = useMemo(() => {
    let espelho = 0;
    let nota = 0;
    for (const r of preview.removed) {
      if (r.reason === 'espelho' || r.reason === 'ambos') espelho += 1;
      if (r.reason === 'nota' || r.reason === 'ambos') nota += 1;
    }
    return { espelho, nota };
  }, [preview.removed]);
  const unidadesPerdidas = preview.recipientsBefore - preview.recipientsAfter;
  const vaiSairVazio = algumFiltro && preview.kept.length === 0;

  // Todas marcadas => null (sem filtro, arquivo idêntico ao de hoje).
  const allowed = useMemo<string[] | null>(
    () => (selected.size >= platformOptions.length ? null : platformOptions.filter((p) => selected.has(p))),
    [selected, platformOptions],
  );

  /**
   * A conta do desconto, refeita a cada mexida nos filtros — a MESMA que o arquivo usa
   * (mesmo escopo, mesmas plataformas, mesmos filtros de conferência). Se prévia e arquivo
   * pudessem divergir, a tela mentiria justamente sobre dinheiro.
   */
  const pessoas = useMemo(
    () => pessoasDesconto(allowed, [...excluidos], { onlyEspelhoConferido, onlyNfValidada, onlyNfNoPrazo }),
    [pessoasDesconto, allowed, excluidos, onlyEspelhoConferido, onlyNfValidada, onlyNfNoPrazo],
  );
  const resumo = useMemo(() => resumoDesconto(modoDesconto, pessoas), [modoDesconto, pessoas]);
  const deductionByDriver = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pessoas) m.set(p.driverId, abaterAgora(modoDesconto, p, p.brutoNoEscopo));
    return m;
  }, [modoDesconto, pessoas]);

  const conflitos = useMemo(
    () => jaPagos(allowed, [...excluidos]),
    [jaPagos, allowed, excluidos],
  );
  /** Um driver pode aparecer em 2 plataformas; a lista de remoção é por PESSOA. */
  const pessoasEmConflito = useMemo(() => {
    const m = new Map<string, {
      name: string; plats: string[]; paidAt: string;
      semDesconto: boolean; comDesconto: boolean; valeOuPerda: number;
    }>();
    for (const c of conflitos) {
      const e = m.get(c.driverId);
      // `false` explícito = aquele pagamento saiu SEM descontar vale/perda.
      const semDesconto = c.deductionsApplied === false;
      const comDesconto = c.deductionsApplied === true;
      if (e) {
        e.plats.push(c.platformName);
        if (c.paidAt > e.paidAt) e.paidAt = c.paidAt;
        e.semDesconto = e.semDesconto || semDesconto;
        e.comDesconto = e.comDesconto || comDesconto;
      } else {
        m.set(c.driverId, {
          name: c.name, plats: [c.platformName], paidAt: c.paidAt,
          semDesconto, comDesconto, valeOuPerda: c.valeOuPerda ?? 0,
        });
      }
    }
    return [...m].map(([driverId, v]) => ({ driverId, ...v }));
  }, [conflitos]);

  /**
   * Quem ficou devendo o desconto DE VERDADE (05/08/2026).
   *
   * 🔴 Antes este aviso listava todo mundo que tivesse sido pago sem abater, e assustava à
   * toa: medido no dia em que o Victor perguntou, dos 55 listados **38 não tinham vale nem
   * perda nenhum** e os outros 17 **já tinham abatido na outra plataforma** — pendente de
   * verdade era ZERO. E o aviso empurrava pra marcar "Descontar vales e perdas", o que
   * cobraria de novo de 25 pessoas (R$ 1.885,14 em dobro).
   */
  const abatidosEmEspelho = useMemo(
    () => new Set(alreadyDeducted.map((d) => d.driverId)),
    [alreadyDeducted],
  );
  const pendentes = useMemo(
    () => descontosPendentes(pessoasEmConflito.map((p) => ({
      driverId: p.driverId,
      name: p.name,
      pagoSemDesconto: p.semDesconto,
      pagoComDesconto: p.comDesconto,
      valeOuPerda: p.valeOuPerda,
      abatidoEmEspelho: abatidosEmEspelho.has(p.driverId),
    }))),
    [pessoasEmConflito, abatidosEmEspelho],
  );

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const handleConfirm = async () => {
    if (allowed && allowed.length === 0) return;
    if (vaiSairVazio) return;
    setGenerating(true);
    try {
      await onConfirm({
        allowed, modoDesconto, includeDeductions, deductionByDriver,
        onlyEspelhoConferido, onlyNfValidada, onlyNfNoPrazo,
        marcarComoPago, excluirDriverIds: [...excluidos],
      });
    } finally {
      setGenerating(false);
    }
  };

  const title = kind === 'geral' ? 'Relatório geral' : 'Relatório simples';

  return (
    <ModalShell
      icon={<FileSpreadsheet className="w-5 h-5" />}
      title={`${title} — opções`}
      subtitle={`${scopeLabel} · o arquivo só é baixado quando você clicar em Baixar.`}
      onClose={onClose}
      maxWidth="sm:max-w-xl"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            disabled={generating || (allowed !== null && allowed.length === 0) || vaiSairVazio}
            data-testid="report-confirm"
            className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Baixar relatório
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* ── Filtro de plataforma ── */}
        <div className="border border-blue-200 bg-blue-50 rounded-md p-3" data-testid="report-platform-box">
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Plataformas deste relatório{' '}
            <span className="font-normal text-gray-500">
              (todas marcadas = relatório completo; desmarque pra pagar só uma plataforma)
            </span>
            :
          </p>
          <div className="flex flex-wrap gap-2">
            {platformOptions.map((name) => {
              const on = selected.has(name);
              return (
                <button
                  key={name}
                  type="button"
                  onClick={() => toggle(name)}
                  data-testid={`report-plat-${name}`}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    on ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                  }`}
                >
                  {on ? '✓ ' : ''}
                  {name}
                </button>
              );
            })}
          </div>
          {allowed !== null && allowed.length > 0 && (
            <p className="text-xs text-blue-800 mt-2">
              O relatório vai sair <b>somente com {allowed.join(' + ')}</b>: quem não tem pacote nessas plataformas
              fica de fora, e os totais contam só elas.
            </p>
          )}
          {allowed !== null && allowed.length === 0 && (
            <p className="text-xs text-red-700 mt-2">Marque ao menos uma plataforma.</p>
          )}
        </div>

        {/* ── Só quem já está conferido (04/08/2026) ──
             Regra "paga o resto": o filtro é driver a driver. Grupo de 10 com 1 pendente
             continua saindo com os 9 — não segura 9 pessoas por causa de 1. */}
        <div
          className={`border rounded-md p-3 ${algumFiltro ? 'border-emerald-300 bg-emerald-50' : 'border-gray-200 bg-gray-50'}`}
          data-testid="report-checks-box"
        >
          <p className="text-xs font-semibold text-gray-700 mb-2">
            Pagar só quem já está conferido{' '}
            <span className="font-normal text-gray-500">(desmarcado = todo mundo, como sempre foi)</span>:
          </p>
          <div className="space-y-2">
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyEspelhoConferido}
                onChange={(e) => setOnlyEspelho(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-gray-300"
                data-testid="report-only-espelho"
              />
              <span className="text-sm text-gray-800">
                Só quem está com o <b>espelho conferido</b>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyNfValidada}
                onChange={(e) => setOnlyNf(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-gray-300"
                data-testid="report-only-nf"
              />
              <span className="text-sm text-gray-800">
                Só quem está com a <b>nota validada</b>
              </span>
            </label>
            <label className="flex items-start gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={onlyNfNoPrazo}
                onChange={(e) => setOnlyPrazo(e.target.checked)}
                className="w-4 h-4 mt-0.5 text-emerald-600 rounded border-gray-300"
                data-testid="report-only-prazo"
              />
              <span className="text-sm text-gray-800">
                Só quem mandou a nota <b>dentro do prazo</b>
                <span className="block text-xs text-gray-500">
                  O prazo é o do espelho de cada um. Espelho publicado sem prazo não corta ninguém.
                </span>
              </span>
            </label>
          </div>

          {algumFiltro && (
            <div className="mt-2 text-xs" data-testid="report-checks-preview">
              {preview.removed.length === 0 ? (
                <p className="text-emerald-800">
                  <b>Todo mundo do escopo passa.</b> O arquivo sai igual ao sem filtro.
                </p>
              ) : (
                <>
                  <p className="text-emerald-900">
                    <b>{preview.removed.length} driver(s) ficam de fora</b>
                    {onlyEspelhoConferido && onlyNfValidada
                      ? ` — ${foraPorMotivo.espelho} sem espelho, ${foraPorMotivo.nota} sem nota`
                      : ''}
                    . O relatório sai com <b>{preview.recipientsAfter}</b> recebedor(es).
                  </p>
                  {unidadesPerdidas > 0 && (
                    <p className="text-amber-900 mt-1">
                      ⚠ <b>{unidadesPerdidas}</b> recebedor(es) somem por completo (ninguém do grupo passou).
                    </p>
                  )}
                  <p className="text-gray-600 mt-1">
                    Num grupo, quem está pendente sai e <b>o resto continua sendo pago</b> na linha do líder.
                  </p>
                  <ul className="mt-1 max-h-24 overflow-y-auto list-disc list-inside text-gray-700">
                    {preview.removed.slice(0, 20).map((r) => (
                      <li key={r.paymentId}>
                        {r.name}
                        {r.group ? ` (${r.group})` : ''} — falta{' '}
                        {r.reason === 'ambos' ? 'espelho e nota' : r.reason}
                      </li>
                    ))}
                  </ul>
                  {preview.removed.length > 20 && (
                    <p className="text-gray-500">…e mais {preview.removed.length - 20}.</p>
                  )}
                </>
              )}
            </div>
          )}
          {vaiSairVazio && (
            <p className="text-xs text-red-700 mt-2" data-testid="report-checks-empty">
              Ninguém do escopo passa nesses filtros — não há o que baixar.
            </p>
          )}
        </div>

        {/* ── ESTA PLANILHA É O PAGAMENTO (04/08/2026) ──────────────────
             Marcando, todo mundo que sair no arquivo ganha a tag "pago" NAS PLATAFORMAS
             DESTE relatório. Pagar só a SHOPEE marca só a SHOPEE. Desmarcado por padrão:
             marcar é o registro de que o dinheiro saiu, tem que ser ato consciente. */}
        <div
          className={`border rounded-md p-3 ${marcarComoPago ? 'border-purple-300 bg-purple-50' : 'border-gray-200 bg-gray-50'}`}
          data-testid="report-pagamento-box"
        >
          <label className="flex items-start gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={marcarComoPago}
              onChange={(e) => setMarcarComoPago(e.target.checked)}
              className="w-4 h-4 mt-0.5 text-purple-600 rounded border-gray-300"
              data-testid="report-marcar-pago"
            />
            <span className="text-sm text-gray-800">
              <b>Esta planilha é o pagamento de verdade</b>
              <span className="block text-xs text-gray-600 mt-0.5">
                Quem sair nela fica com <b>pago</b>
                {allowed && allowed.length > 0 ? ` em ${allowed.join(' + ')}` : ' nas plataformas em que tem pacote'}.
                Num grupo, marca <b>cada membro</b> — o dinheiro da linha do líder cobre todos.
              </span>
            </span>
          </label>

          {pessoasEmConflito.length > 0 && (
            <div className="mt-2 rounded-md border-2 border-amber-400 bg-amber-50 px-3 py-2" data-testid="report-ja-pagos">
              <p className="text-sm font-bold text-amber-900">
                ⚠ {pessoasEmConflito.length} entregador(es) já foram pagos nestas plataformas
              </p>
              <ul className="mt-1 max-h-32 overflow-y-auto text-xs text-amber-900 space-y-1">
                {pessoasEmConflito.map((p) => (
                  <li key={p.driverId} className="flex items-center justify-between gap-2">
                    <span>
                      <b>{p.name}</b> — {p.plats.join(', ')}, pago em{' '}
                      {new Date(p.paidAt).toLocaleDateString('pt-BR')}
                      {p.semDesconto && (
                        <b className="text-red-800"> · sem desconto de vale/perda</b>
                      )}
                    </span>
                    <button
                      type="button"
                      onClick={() => setExcluidos((prev) => new Set(prev).add(p.driverId))}
                      data-testid={`tirar-${p.driverId}`}
                      className="px-2 py-0.5 rounded border border-amber-500 text-amber-900 hover:bg-amber-100 whitespace-nowrap"
                    >
                      tirar do relatório
                    </button>
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={() => setExcluidos((prev) => {
                  const n = new Set(prev);
                  for (const p of pessoasEmConflito) n.add(p.driverId);
                  return n;
                })}
                data-testid="tirar-todos-ja-pagos"
                className="mt-1.5 text-xs font-semibold text-amber-900 underline"
              >
                Tirar todos estes do relatório
              </button>
              <p className="text-xs text-amber-800 mt-1">
                Se baixar assim, eles entram <b>de novo</b> na planilha de pagamento.
              </p>
            </div>
          )}

          {excluidos.size > 0 && (
            <p className="mt-2 text-xs text-gray-700" data-testid="report-excluidos">
              <b>{excluidos.size} entregador(es) tirados</b> deste relatório.{' '}
              <button type="button" onClick={() => setExcluidos(new Set())} className="underline text-blue-700">
                desfazer
              </button>
            </p>
          )}
        </div>

        {/* ── Como descontar vales e perdas (07/08/2026) ──
             Era uma caixa de marcar (tudo-ou-nada). Pagando por plataforma as duas posições
             erravam: marcada cobrava de novo de quem já tinha sido descontado, desmarcada
             deixava sem desconto quem nunca foi. Agora são três escolhas, e a conta de cada
             uma aparece ANTES de baixar. */}
        {deductionsTotal > 0 && (
          <div
            className={`border rounded-md p-3 ${
              modoDesconto === 'nenhum' ? 'border-amber-300 bg-amber-50' : 'border-gray-200 bg-gray-50'
            }`}
            data-testid="report-deductions-box"
          >
            <p className="text-xs font-semibold text-gray-700 mb-2">
              Vales e perdas deste relatório{' '}
              <span className="font-normal text-gray-500">({formatBRLIf(deductionsTotal, canViewValues)} no total)</span>
            </p>

            <div className="space-y-1.5" role="radiogroup" aria-label="Como descontar vales e perdas">
              {([
                {
                  modo: 'pendentes' as const,
                  testid: 'report-deductions-modo-pendentes',
                  titulo: 'Descontar só de quem ainda não foi descontado',
                  recomendado: true,
                  ajuda: 'Cada pessoa é conferida: quem já teve o desconto num pagamento anterior sai sem, quem ainda não teve sai com. É o que evita cobrar duas vezes ao pagar plataforma por plataforma.',
                },
                {
                  modo: 'todos' as const,
                  testid: 'report-deductions-modo-todos',
                  titulo: 'Descontar de todo mundo',
                  recomendado: false,
                  ajuda: 'O valor cheio de cada um, mesmo de quem já foi descontado antes. Pode cobrar em dobro — use só quando souber que ninguém foi descontado ainda.',
                },
                {
                  modo: 'nenhum' as const,
                  testid: 'report-deductions-modo-nenhum',
                  titulo: 'Não descontar de ninguém',
                  recomendado: false,
                  ajuda: 'Pagamento PARCIAL: as colunas mostram os valores mas o total NÃO abate (eles saem no pagamento das demais plataformas).',
                },
              ]).map((op) => (
                <label
                  key={op.modo}
                  className={`flex items-start gap-2 cursor-pointer rounded-md p-2 border ${
                    modoDesconto === op.modo ? 'border-blue-400 bg-white' : 'border-transparent hover:bg-white/60'
                  }`}
                >
                  <input
                    type="radio"
                    name="modo-desconto"
                    checked={modoDesconto === op.modo}
                    onChange={() => setModoDesconto(op.modo)}
                    className="w-4 h-4 mt-0.5 text-blue-600 border-gray-300"
                    data-testid={op.testid}
                  />
                  <span className="text-sm text-gray-800">
                    <b>{op.titulo}</b>
                    {op.recomendado && (
                      <span className="ml-1.5 text-[11px] font-semibold text-blue-700 bg-blue-100 rounded px-1.5 py-0.5">
                        recomendado
                      </span>
                    )}
                    <span className="block text-xs text-gray-600 mt-0.5">{op.ajuda}</span>
                  </span>
                </label>
              ))}
            </div>

            {/* ── A conta, antes de baixar ──
                 Antes daqui a tela listava 25 nomes e mandava o operador conferir na mão. */}
            {modoDesconto !== 'nenhum' && (
              <div className="mt-3 pt-3 border-t border-gray-200 space-y-1.5" data-testid="report-deductions-preview">
                {resumo.vaoDescontar.length > 0 && (
                  <ResumoLinha
                    testid="report-deducao-vao"
                    cor="text-emerald-800"
                    texto={`${resumo.vaoDescontar.length} vão ser descontados`}
                    valor={resumo.totalDescontar}
                    nomes={resumo.vaoDescontar}
                    canViewValues={canViewValues}
                  />
                )}
                {resumo.jaDescontados.length > 0 && (
                  <ResumoLinha
                    testid="report-deducao-ja"
                    cor="text-gray-700"
                    texto={`${resumo.jaDescontados.length} já foram descontados antes — saem sem desconto`}
                    valor={resumo.totalJaDescontado}
                    nomes={resumo.jaDescontados}
                    canViewValues={canViewValues}
                  />
                )}
                {resumo.sobrando.length > 0 && (
                  <ResumoLinha
                    testid="report-deducao-sobra"
                    cor="text-amber-800"
                    texto={`${resumo.sobrando.length} ficam devendo o resto pro próximo pagamento`}
                    valor={resumo.totalSobrando}
                    nomes={resumo.sobrando}
                    canViewValues={canViewValues}
                  />
                )}
                {resumo.vaoDescontar.length === 0
                  && resumo.jaDescontados.length === 0
                  && resumo.sobrando.length === 0 && (
                  <p className="text-xs text-gray-600">
                    Ninguém deste relatório tem vale ou perda a descontar.
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── 🔴 Sem marcar como pago, o desconto se repete no próximo relatório ──
             O sistema só sabe que alguém foi descontado se esta planilha for registrada
             como o pagamento. Decisão dele (07/08): avisar em vermelho, não marcar sozinho. */}
        {modoDesconto === 'pendentes' && !marcarComoPago && resumo.totalDescontar > 0 && (
          <div
            className="border-2 border-red-300 bg-red-50 rounded-md p-3 text-sm text-red-900"
            data-testid="report-desconto-sem-marca"
          >
            <p className="font-bold">
              ⚠ Marque &quot;esta planilha é o pagamento&quot; — senão o desconto se repete
            </p>
            <p className="text-xs mt-1">
              O sistema só sabe que {resumo.vaoDescontar.length} pessoa(s) foram descontadas em{' '}
              {formatBRLIf(resumo.totalDescontar, canViewValues)} <b>se esta planilha for registrada como o pagamento</b>.
              Baixando sem marcar, o próximo relatório vai descontar essa mesma gente de novo.
            </p>
          </div>
        )}

        {/* ── Desconto que ficou pendente de um pagamento anterior (04/08/2026) ──
             Quando o pagamento sai PARCIAL, o vale/perda não é abatido e fica pra sair no
             pagamento das demais plataformas. Se ninguém lembrar, o desconto some. */}
        {pendentes.length > 0 && (
          <div
            className="border-2 border-red-300 bg-red-50 rounded-md p-3 text-sm text-red-900"
            data-testid="report-desconto-pendente"
          >
            <p className="font-bold">
              ⚠ {pendentes.length} entregador(es) com desconto de vale/perda PENDENTE
              {' '}({formatBRLIf(totalPendente(pendentes), canViewValues)})
            </p>
            <p className="text-xs mt-1">
              {pendentes.map((p) => `${p.name} (${formatBRLIf(p.valor, canViewValues)})`).join(', ')}.
            </p>
            <p className="text-xs mt-1">
              Foram pagos sem abater e o desconto <b>não saiu em nenhuma outra plataforma</b> —
              era pra sair no pagamento das demais.{' '}
              {modoDesconto === 'nenhum'
                ? <b className="text-red-800">Com &quot;Não descontar de ninguém&quot; escolhido, ele continua pendente.</b>
                : <b>Do jeito escolhido acima, ele sai agora.</b>}
            </p>
          </div>
        )}

        {/* ── Aviso anti-desconto-duplo ──
             Só no modo "todos": no modo "pendentes" o próprio sistema já pula essa gente,
             então repetir o aviso ali seria assustar sem motivo (o erro do aviso de 05/08). */}
        {modoDesconto === 'todos' && alreadyDeducted.length > 0 && (
          <div
            className="border-2 border-amber-400 bg-amber-50 rounded-md p-3 text-sm text-amber-900"
            data-testid="report-already-deducted-warning"
          >
            <p className="font-bold">⚠ Atenção: vale/perda já descontado neste período</p>
            <ul className="mt-1 list-disc list-inside space-y-0.5">
              {alreadyDeducted.map((d) => (
                <li key={d.driverId}>
                  <b>{d.name}</b> já teve {formatBRLIf(d.amount, canViewValues)} abatido num espelho publicado.
                </li>
              ))}
            </ul>
            <p className="mt-1 text-xs">
              Se baixar assim, o valor é descontado de novo. Desmarque "Descontar vales e perdas" se este for o
              pagamento das demais plataformas.
            </p>
          </div>
        )}
      </div>
    </ModalShell>
  );
};
