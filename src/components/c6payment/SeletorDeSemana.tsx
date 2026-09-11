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

import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, CalendarRange, CalendarDays } from 'lucide-react';
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
                <span className="text-sm font-bold text-gray-800">{rotuloDoMes(mesNaTela)}</span>
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
