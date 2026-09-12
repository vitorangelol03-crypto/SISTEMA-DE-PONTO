/**
 * ESCOLHER A SEMANA EM DOIS CLIQUES — mês, depois semana.
 *
 * Pedido do Victor (11/09/2026):
 *
 *   *"na aba de arquivo de pagamento eu não quero selecionar do jeito que está.
 *   Quero que apareça realmente ali janeiro, tudo dividido… eu seleciono um mês,
 *   e dentro do mês eu seleciono a semana. Automaticamente, ao clicar em gerar
 *   arquivo de pagamento, já vem marcando a semana atual que está aberta pra
 *   pagamento. Mas ali a gente consegue ir andando pelas semanas, pelos meses,
 *   sem precisar filtrar no calendário. Quero TAMBÉM ter a opção de filtrar no
 *   calendário, sem precisar respeitar a regra da semana."*
 *
 * Por isso são DOIS modos, e os dois ficam: **Semanas** (o rápido, que abre
 * sozinho na semana aberta) e **Datas livres** (o calendário de sempre, que não
 * respeita a regra da semana). Trocar de modo não perde o que foi escolhido.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange, CalendarDays, ChevronDown } from 'lucide-react';
import type { PaymentPeriod } from '../../services/database';

export interface PeriodoEscolhido {
  /** `null` quando a escolha veio do calendário livre (não é uma semana). */
  periodId: string | null;
  startDate: string;
  endDate: string;
}

interface Props {
  /** Todas as semanas cadastradas da empresa. */
  periodos: PaymentPeriod[];
  escolhido: PeriodoEscolhido;
  onEscolher: (p: PeriodoEscolhido) => void;
  /** Desliga os cliques enquanto a prévia está sendo montada. */
  ocupado?: boolean;
}

const MESES = [
  'JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO',
  'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO',
];

/** "JAN", "FEV"… — o que cabe no quadradinho do painel. */
const MESES_CURTOS = MESES.map((m) => m.slice(0, 3));

/** `2026-09-07` → `07/09` */
function diaMes(iso: string): string {
  const [, m, d] = (iso || '').split('-');
  return d && m ? `${d}/${m}` : '';
}

/** O mês da semana é o do PAGAMENTO — mesma regra das gavetas do Financeiro. */
function mesDoPeriodo(p: PaymentPeriod): string {
  return (p.payment_date || p.end_date || '').slice(0, 7);
}

function rotuloDoMes(chave: string): string {
  const [ano, mes] = chave.split('-');
  return `${MESES[Number(mes) - 1] ?? ''} ${ano}`;
}

export const SeletorDeSemana: React.FC<Props> = ({ periodos, escolhido, onEscolher, ocupado }) => {
  /**
   * ⚠️ O modo NÃO pode ser decidido só no primeiro render: as semanas chegam
   * depois (busca), e `escolhido.periodId` ainda é `null` naquele instante — o
   * seletor abria em "Datas livres" mesmo havendo semana aberta pra pagar.
   * Então: enquanto a pessoa não escolher um modo na mão, vale o que faz
   * sentido AGORA — "Semanas" se existe semana, "Datas livres" se não existe.
   */
  const [modoEscolhidoNaMao, setModoEscolhidoNaMao] = useState<'semanas' | 'livre' | null>(null);

  /** Os meses que têm semana, do mais novo pro mais antigo. */
  const meses = useMemo(() => {
    const mapa = new Map<string, PaymentPeriod[]>();
    for (const p of periodos) {
      const chave = mesDoPeriodo(p);
      if (!chave) continue;
      mapa.set(chave, [...(mapa.get(chave) ?? []), p]);
    }
    return [...mapa.entries()]
      .map(([chave, lista]) => ({
        chave,
        semanas: [...lista].sort((a, b) => a.start_date.localeCompare(b.start_date)),
      }))
      .sort((a, b) => b.chave.localeCompare(a.chave));
  }, [periodos]);

  /** O mês que está aberto na tela: o da semana escolhida, senão o mais novo. */
  const mesDaEscolha = useMemo(() => {
    const p = periodos.find((x) => x.id === escolhido.periodId);
    return p ? mesDoPeriodo(p) : (meses[0]?.chave ?? '');
  }, [periodos, escolhido.periodId, meses]);

  const [mesAberto, setMesAberto] = useState(mesDaEscolha);
  // Se a escolha mudou por fora (ex.: abriu já na semana aberta), acompanha.
  const mesNaTela = meses.some((m) => m.chave === mesAberto) ? mesAberto : mesDaEscolha;

  const iMes = meses.findIndex((m) => m.chave === mesNaTela);
  const doMes = meses[iMes]?.semanas ?? [];
  const modo = modoEscolhidoNaMao ?? (periodos.length > 0 ? 'semanas' : 'livre');

  /**
   * O PAINEL DE MESES — pedido do Victor (11/09/2026): *"coloque tipo uma tabela
   * de mês pra não precisar ficar toda hora clicando na setinha; abre uma
   * janelinha flutuante pequena e a pessoa clica direto no mês que ela quer"*.
   *
   * As setas continuam, pra quem quer ir de um em um.
   */
  const [painelAberto, setPainelAberto] = useState(false);
  const [anoDoPainel, setAnoDoPainel] = useState('');
  const caixaDoPainel = useRef<HTMLDivElement>(null);

  /** Os anos que têm semana, do mais novo pro mais antigo. */
  const anos = useMemo(
    () => [...new Set(meses.map((m) => m.chave.slice(0, 4)))].sort((a, b) => b.localeCompare(a)),
    [meses],
  );
  const anoNaTela = anos.includes(anoDoPainel) ? anoDoPainel : (mesNaTela.slice(0, 4) || anos[0] || '');
  /** Quantas semanas cada mês do ano tem — mês sem semana fica apagado. */
  const semanasPorMes = useMemo(() => {
    const conta = new Map<string, number>();
    for (const m of meses) conta.set(m.chave, m.semanas.length);
    return conta;
  }, [meses]);

  // Fecha o painel ao clicar fora ou apertar Esc — senão ele fica preso na tela.
  useEffect(() => {
    if (!painelAberto) return;
    const foraDaCaixa = (e: MouseEvent) => {
      if (caixaDoPainel.current && !caixaDoPainel.current.contains(e.target as Node)) {
        setPainelAberto(false);
      }
    };
    const aoEscapar = (e: KeyboardEvent) => { if (e.key === 'Escape') setPainelAberto(false); };
    document.addEventListener('mousedown', foraDaCaixa);
    document.addEventListener('keydown', aoEscapar);
    return () => {
      document.removeEventListener('mousedown', foraDaCaixa);
      document.removeEventListener('keydown', aoEscapar);
    };
  }, [painelAberto]);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden" data-testid="seletor-de-semana">
      {/* ── Os dois modos ─────────────────────────────────────────────────── */}
      <div className="flex border-b border-gray-200 bg-gray-50">
        {([
          ['semanas', 'Semanas', <CalendarRange key="a" size={15} />],
          ['livre', 'Datas livres', <CalendarDays key="b" size={15} />],
        ] as const).map(([m, texto, icone]) => (
          <button
            key={m}
            type="button"
            onClick={() => setModoEscolhidoNaMao(m)}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold min-h-[44px] ${
              modo === m
                ? 'bg-white text-blue-700 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {icone}{texto}
          </button>
        ))}
      </div>

      {modo === 'semanas' ? (
        <div className="p-3 space-y-3">
          {meses.length === 0 ? (
            <p className="text-sm text-gray-500 py-2">
              Nenhuma semana cadastrada ainda. Use <b>Datas livres</b>.
            </p>
          ) : (
            <>
              {/* Navegar pelos meses sem abrir lista nenhuma. */}
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  disabled={ocupado || iMes >= meses.length - 1}
                  onClick={() => setMesAberto(meses[iMes + 1].chave)}
                  aria-label="Mês anterior"
                  className="p-2 min-h-[40px] min-w-[40px] rounded-md text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
                >
                  <ChevronLeft size={18} />
                </button>
                <div className="relative" ref={caixaDoPainel}>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() => { setAnoDoPainel(mesNaTela.slice(0, 4)); setPainelAberto((v) => !v); }}
                    aria-expanded={painelAberto}
                    data-testid="abrir-painel-de-meses"
                    title="Escolher o mês direto"
                    className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-md text-sm font-bold text-gray-800 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {/* O rótulo fica num <span class="font-bold"> de propósito: é por
                        ele que os testes 113/114 acham o mês na tela. */}
                    <span data-testid="mes-na-tela" className="font-bold">{rotuloDoMes(mesNaTela)}</span>
                    <ChevronDown size={15} className={`text-gray-500 transition-transform ${painelAberto ? 'rotate-180' : ''}`} />
                  </button>

                  {painelAberto && (
                    <div
                      data-testid="painel-de-meses"
                      className="absolute z-50 left-1/2 -translate-x-1/2 mt-1 w-[260px] bg-white border border-gray-200 rounded-lg shadow-lg p-2"
                    >
                      {/* O ano, pra alcançar qualquer mês sem sair do painel. */}
                      <div className="flex items-center justify-between mb-2">
                        <button
                          type="button"
                          disabled={anos.indexOf(anoNaTela) >= anos.length - 1}
                          onClick={() => setAnoDoPainel(anos[anos.indexOf(anoNaTela) + 1])}
                          aria-label="Ano anterior"
                          className="p-1.5 min-h-[36px] min-w-[36px] rounded text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
                        >
                          <ChevronLeft size={16} />
                        </button>
                        <span className="text-sm font-bold text-gray-700">{anoNaTela}</span>
                        <button
                          type="button"
                          disabled={anos.indexOf(anoNaTela) <= 0}
                          onClick={() => setAnoDoPainel(anos[anos.indexOf(anoNaTela) - 1])}
                          aria-label="Ano seguinte"
                          className="p-1.5 min-h-[36px] min-w-[36px] rounded text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
                        >
                          <ChevronRight size={16} />
                        </button>
                      </div>

                      {/* Os 12 meses. Mês sem semana fica apagado e não clica —
                          mostrar todos mantém a grade sempre no mesmo lugar. */}
                      <div className="grid grid-cols-4 gap-1">
                        {MESES_CURTOS.map((curto, i) => {
                          const chave = `${anoNaTela}-${String(i + 1).padStart(2, '0')}`;
                          const quantas = semanasPorMes.get(chave) ?? 0;
                          const ehOAtual = chave === mesNaTela;
                          return (
                            <button
                              key={chave}
                              type="button"
                              disabled={quantas === 0}
                              onClick={() => { setMesAberto(chave); setPainelAberto(false); }}
                              title={quantas === 0
                                ? 'Sem semana cadastrada neste mês'
                                : `${quantas} semana${quantas === 1 ? '' : 's'}`}
                              className={`py-2 min-h-[40px] rounded-md text-xs font-semibold ${
                                ehOAtual
                                  ? 'bg-blue-600 text-white'
                                  : quantas === 0
                                    ? 'text-gray-300 cursor-not-allowed'
                                    : 'text-gray-700 hover:bg-blue-50'
                              }`}
                            >
                              {curto}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  disabled={ocupado || iMes <= 0}
                  onClick={() => setMesAberto(meses[iMes - 1].chave)}
                  aria-label="Mês seguinte"
                  className="p-2 min-h-[40px] min-w-[40px] rounded-md text-gray-600 hover:bg-gray-100 disabled:text-gray-300 disabled:hover:bg-transparent"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              {/* As semanas do mês, uma por botão. */}
              <div className="flex flex-wrap gap-2">
                {doMes.map((p, i) => {
                  const ehEscolhida = p.id === escolhido.periodId;
                  const aberta = p.status === 'open';
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={ocupado}
                      onClick={() => onEscolher({
                        periodId: p.id, startDate: p.start_date, endDate: p.end_date,
                      })}
                      className={`flex flex-col items-start px-3 py-2 min-h-[44px] rounded-lg border text-left disabled:opacity-50 ${
                        ehEscolhida
                          ? 'bg-blue-600 border-blue-600 text-white'
                          : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-sm font-semibold flex items-center gap-1.5">
                        Semana {i + 1}
                        {aberta && (
                          <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                            ehEscolhida ? 'bg-white/25 text-white' : 'bg-amber-100 text-amber-800'
                          }`}>
                            ABERTA
                          </span>
                        )}
                      </span>
                      <span className={`text-[11px] ${ehEscolhida ? 'text-blue-100' : 'text-gray-500'}`}>
                        {diaMes(p.start_date)} – {diaMes(p.end_date)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
      ) : (
        /* ── O calendário de sempre, sem respeitar a regra da semana ──────── */
        <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data inicial</label>
            <input
              type="date"
              value={escolhido.startDate}
              disabled={ocupado}
              onChange={(e) => onEscolher({
                periodId: null, startDate: e.target.value, endDate: escolhido.endDate,
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Data final</label>
            <input
              type="date"
              value={escolhido.endDate}
              disabled={ocupado}
              onChange={(e) => onEscolher({
                periodId: null, startDate: escolhido.startDate, endDate: e.target.value,
              })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md min-h-[44px] text-sm focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}
    </div>
  );
};
