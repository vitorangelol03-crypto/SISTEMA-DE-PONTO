/**
 * HISTÓRICO DE PAGAMENTOS EM GAVETAS — Etapa 2 do `PLANO_FINANCEIRO_2026-09.md`.
 *
 * Desenhado com o Victor em 10/09/2026 (o canvas do mockup está em
 * `design/financeiro-etapa2/`). Uma gaveta por MÊS, as semanas dentro, e na linha
 * fechada tudo que importa — *"sem precisar abrir as gavetas"*: valor, quantos
 * foram pagos, a divisão diarista × carteira assinada, quantos descontados e
 * quantos erros, separados por vínculo.
 *
 * A conta mora em `src/utils/historicoPagamentos.ts` (função pura, testada). Aqui
 * é só a tela.
 */
import React, { useMemo, useState } from 'react';
import {
  ChevronRight, DollarSign, Users, Minus, AlertTriangle, Briefcase, FileText, X,
} from 'lucide-react';
import {
  montarHistorico, foraDasGavetas, textoErros,
  type SemanaDoHistorico, type ErroDoHistorico,
  type PagamentoDoHistorico, type PeriodoDePagamento,
} from '../../utils/historicoPagamentos';

interface Props {
  periodos: PeriodoDePagamento[];
  pagamentos: PagamentoDoHistorico[];
  erros: ErroDoHistorico[];
  /** `YYYY-MM` do mês corrente — a gaveta que abre sozinha. */
  mesCorrente: string;
  /** Sem permissão de ver valor, os R$ saem mascarados (mesma regra do resto da aba). */
  podeVerValores: boolean;
  /** Abre a tela de gerar recibo daquele período. */
  onGerarPdf?: (escopo: { titulo: string; inicio: string; fim: string }) => void;
}

const brl = (v: number, pode: boolean) =>
  pode ? `R$ ${v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : 'R$ ••••';

/** O que o popup de erros está mostrando. */
interface PopupErros {
  titulo: string;
  subtitulo: string;
  itens: ErroDoHistorico[];
}

export const HistoricoPagamentos: React.FC<Props> = ({
  periodos, pagamentos, erros, mesCorrente, podeVerValores, onGerarPdf,
}) => {
  // `undefined` = ninguém clicou ainda; aí vale o mês em andamento (pedido do
  // Victor: a aba já abre no período que está aberto).
  const [aberto, setAberto] = useState<string | undefined>(undefined);
  const [popup, setPopup] = useState<PopupErros | null>(null);

  const meses = useMemo(
    () => montarHistorico(periodos, pagamentos, erros, mesCorrente),
    [periodos, pagamentos, erros, mesCorrente],
  );

  // O que não coube em gaveta nenhuma (dia sem período cadastrado, ou período
  // sem data de pagamento). Antes sumia calado — dinheiro e erro reais fora de
  // toda soma. Agora aparece em aviso. (Achado em revisão, 11/09/2026.)
  const orfaos = useMemo(
    () => foraDasGavetas(periodos, pagamentos, erros),
    [periodos, pagamentos, erros],
  );
  const temOrfao = orfaos.pagamentos.length > 0 || orfaos.erros.length > 0;

  const mesEmAndamento = meses.find((m) => m.emAndamento)?.chave ?? meses[0]?.chave;
  const escolhido = aberto === undefined ? mesEmAndamento : aberto;

  if (meses.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow p-6 text-center text-gray-500">
        <FileText className="w-10 h-10 mx-auto mb-3 text-gray-300" />
        <p className="font-medium">Nenhum período de pagamento cadastrado.</p>
        <p className="text-sm">Crie um período para o histórico aparecer aqui.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {meses.map((mes) => {
        const estaAberto = escolhido === mes.chave;
        return (
          // SEM `overflow-hidden`: ele existia só pra arredondar os cantos, e de
          // quebra CORTAVA o balão do hover dos erros, que desce pra fora da
          // linha — com a gaveta fechada não dava pra ver nada. O arredondamento
          // agora vem das pontas. (Achado em revisão, 11/09/2026.)
          <div key={mes.chave} className="bg-white rounded-lg shadow">
            {/* ── LINHA FECHADA DO MÊS ─────────────────────────────────────── */}
            <div
              role="button"
              tabIndex={0}
              onClick={() => setAberto(estaAberto ? '' : mes.chave)}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setAberto(estaAberto ? '' : mes.chave); }}
              className={`flex flex-wrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-4 cursor-pointer hover:bg-gray-50 min-h-[44px] ${estaAberto ? 'rounded-t-lg' : 'rounded-lg'}`}
            >
              <ChevronRight
                size={18}
                className={`text-gray-500 flex-shrink-0 transition-transform ${estaAberto ? 'rotate-90' : ''}`}
              />
              <div className="flex items-baseline gap-2 min-w-[150px]">
                <span className="text-base font-bold text-gray-800">{mes.nome}</span>
                <span className="text-sm font-medium text-gray-400">{mes.ano}</span>
              </div>
              {mes.emAndamento && (
                <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 whitespace-nowrap">
                  EM ANDAMENTO
                </span>
              )}

              <div className="flex-grow" />

              {/* Os números que aparecem SEM abrir */}
              <div className="flex items-center gap-2 flex-wrap justify-end">
                <Pilula cor="green" icone={<DollarSign size={14} />}>
                  <b>{brl(mes.valor, podeVerValores)}</b>
                </Pilula>
                <Pilula cor="blue" icone={<Users size={14} />}>
                  <b>{mes.pagos} pagos</b>
                  <span className="text-gray-500 font-medium">
                    ({mes.pagosDiarista} diaristas · {mes.pagosClt} CLT)
                  </span>
                </Pilula>
                <Pilula cor="orange" icone={<Minus size={14} />}>
                  <b>{mes.descontados}</b> <span className="text-orange-800 font-medium">descontados</span>
                </Pilula>
                <TagErros
                  total={mes.erros} diarista={mes.errosDiarista} clt={mes.errosClt}
                  itens={mes.listaErros}
                  onAbrir={() => setPopup({
                    titulo: `Erros de ${mes.nome}/${mes.ano}`,
                    subtitulo: 'Mês inteiro — todas as semanas',
                    itens: mes.listaErros,
                  })}
                />
              </div>

              {onGerarPdf && mes.semanas.length > 0 && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    // MENOR início e MAIOR fim, não o primeiro e o último da
                    // lista: com semanas sobrepostas a última a começar pode
                    // terminar ANTES de outra, e o mês sairia cortado.
                    onGerarPdf({
                      titulo: `${mes.nome}/${mes.ano}`,
                      inicio: mes.semanas.reduce((a, s) => (s.startDate < a ? s.startDate : a), mes.semanas[0].startDate),
                      fim: mes.semanas.reduce((a, s) => (s.endDate > a ? s.endDate : a), mes.semanas[0].endDate),
                    });
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 min-h-[40px] rounded-lg bg-blue-50 border border-blue-200 text-blue-800 text-sm font-semibold hover:bg-blue-100 whitespace-nowrap flex-shrink-0"
                >
                  <FileText size={15} /> PDF do mês
                </button>
              )}
            </div>

            {/* ── GAVETA ABERTA ────────────────────────────────────────────── */}
            {estaAberto && (
              <div className="border-t border-gray-200 bg-gray-50 px-4 sm:px-5 pb-4">
                <div className="text-[11px] font-semibold text-gray-500 uppercase tracking-wider pt-3 pb-2 pl-0 sm:pl-7">
                  Por semana
                </div>

                <div className="space-y-1.5">
                  {mes.semanas.map((sem) => (
                    <LinhaSemana
                      key={sem.periodoId}
                      semana={sem}
                      mesNome={`${mes.nome}/${mes.ano}`}
                      podeVerValores={podeVerValores}
                      onGerarPdf={onGerarPdf}
                      onAbrirErros={() => setPopup({
                        titulo: `Erros da ${sem.numero}`,
                        subtitulo: `${mes.nome}/${mes.ano} · ${sem.intervalo}`,
                        itens: sem.listaErros,
                      })}
                    />
                  ))}
                </div>

                {/* ⚠️ RECORTE, NÃO PARCELA. Os pagamentos de carteira assinada
                    estão DENTRO das semanas acima (o Victor pediu assim: "a semana
                    tem os dois"). Este bloco só repete a fatia deles, separada.
                    O texto tem que dizer isso — antes dizia "sem divisão por
                    semana", e quem somasse bloco + semanas contava R$ 3.879 duas
                    vezes. (Achado em revisão, 11/09/2026.) */}
                <div className="mt-4 pt-3 border-t border-dashed border-gray-300">
                  <div className="flex flex-wrap items-center gap-3 p-3 bg-purple-50 border border-purple-200 rounded-md">
                    <Briefcase size={18} className="text-purple-600 flex-shrink-0" />
                    <div className="flex flex-col">
                      <span className="text-sm font-semibold text-purple-900">Carteira assinada — no mês</span>
                      <span className="text-xs text-purple-700">Já contado nas semanas acima — aqui é só a parte deles</span>
                    </div>
                    <div className="flex-grow" />
                    <div className="flex items-center gap-4 sm:gap-5 flex-wrap justify-end">
                      <span className="text-sm font-bold text-green-600">
                        {brl(mes.carteiraAssinada.valor, podeVerValores)}
                      </span>
                      <span className="text-[13px] text-gray-700">
                        <b className="text-purple-600">{mes.carteiraAssinada.pessoas}</b> pessoas
                      </span>
                      <span className={`text-[13px] ${mes.carteiraAssinada.descontados > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
                        {mes.carteiraAssinada.descontados} descontados
                      </span>
                      <span className={`text-[13px] ${mes.carteiraAssinada.erros > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                        {mes.carteiraAssinada.erros === 0 ? 'sem erro'
                          : mes.carteiraAssinada.erros === 1 ? '1 erro' : `${mes.carteiraAssinada.erros} erros`}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {temOrfao && (
        <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={18} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 leading-relaxed">
            <b>Fora das gavetas:</b>{' '}
            {orfaos.pagamentos.length > 0 && (
              <>
                {orfaos.pagamentos.length === 1 ? '1 pagamento' : `${orfaos.pagamentos.length} pagamentos`}
                {podeVerValores ? ` (${brl(
                  orfaos.pagamentos.reduce((t, p) => t + (p.total ?? 0), 0), true,
                )})` : ''}
                {orfaos.erros.length > 0 ? ' e ' : ''}
              </>
            )}
            {orfaos.erros.length > 0 && (orfaos.erros.length === 1 ? '1 erro' : `${orfaos.erros.length} erros`)}
            {' '}caíram em dias que nenhum período de pagamento cobre — ou num período sem data de
            pagamento. Eles <b>não entram</b> em nenhuma soma acima. Para aparecerem, cadastre o
            período que falta (ou preencha a data de pagamento dele).
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 px-1 leading-relaxed">
        Semana que atravessa o mês entra na gaveta do mês em que foi paga.<br />
        Quem muda de diarista para carteira assinada mantém o histórico: cada pagamento guarda o
        vínculo do dia em que foi feito, e a mudança vale daí em diante.
      </p>

      {popup && <PopupDeErros popup={popup} onFechar={() => setPopup(null)} />}
    </div>
  );
};

/** Pílula colorida com o vocabulário do Financeiro (verde dinheiro, azul pessoas…). */
const Pilula: React.FC<{ cor: 'green' | 'blue' | 'orange'; icone: React.ReactNode; children: React.ReactNode }> =
  ({ cor, icone, children }) => {
    const tons = {
      green: 'bg-green-50 border-green-200 text-green-600',
      blue: 'bg-blue-50 border-blue-200 text-blue-600',
      orange: 'bg-orange-50 border-orange-200 text-orange-600',
    }[cor];
    return (
      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm whitespace-nowrap ${tons}`}>
        {icone}{children}
      </div>
    );
  };

/**
 * A tag vermelha dos erros: passar o mouse mostra quem errou (nome, equipe,
 * vínculo, dia e o erro escrito); clicar abre a lista completa.
 */
const TagErros: React.FC<{
  total: number; diarista: number; clt: number;
  itens: ErroDoHistorico[]; onAbrir: () => void;
}> = ({ total, diarista, clt, itens, onAbrir }) => {
  const tem = total > 0;
  // Sem erro, a tag NÃO é botão: clicar abria um popup vazio ("Nenhum erro deste
  // tipo"), o que parece defeito. Sem erro é notícia boa e não tem o que abrir.
  return (
    <div
      {...(tem
        ? {
            role: 'button' as const,
            tabIndex: 0,
            onClick: (e: React.MouseEvent) => { e.stopPropagation(); onAbrir(); },
            onKeyDown: (e: React.KeyboardEvent) => {
              if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); e.preventDefault(); onAbrir(); }
            },
          }
        : {})}
      className={`group relative flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-sm whitespace-nowrap ${
        tem ? 'bg-red-50 border-red-200 text-red-600 cursor-pointer' : 'bg-gray-50 border-gray-200 text-gray-400 cursor-default'
      }`}
      title={tem ? 'Clique para ver os erros' : 'Sem erro no período'}
    >
      <AlertTriangle size={14} />
      <b>{textoErros(total, diarista, clt)}</b>

      {tem && (
        <div className="hidden group-hover:block absolute top-full right-0 mt-2 z-50 w-[420px] max-w-[92vw] bg-white border border-gray-200 rounded-lg shadow-lg overflow-hidden text-left cursor-default">
          <div className="px-3.5 py-2.5 bg-red-50 border-b border-red-200 text-xs font-semibold text-red-700">
            {total === 1 ? '1 erro no período' : `${total} erros no período`}
          </div>
          {itens.slice(0, 3).map((e) => (
            <div key={e.id} className="px-3.5 py-2.5 border-b border-gray-100">
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-[13px] font-semibold text-gray-800">{e.nome}</span>
                <SeloVinculo vinculo={e.vinculo} />
              </div>
              <div className="text-[11px] text-gray-500 mb-0.5">{e.equipe} · {formatarDia(e.date)}</div>
              <div className="text-xs text-gray-700 leading-snug">{e.descricao}</div>
            </div>
          ))}
          <div className="px-3.5 py-2 text-[11px] font-semibold text-blue-600 bg-gray-50">
            {itens.length > 3 ? `Clique para ver os ${itens.length} erros` : 'Clique para ver tudo, separado por vínculo'}
          </div>
        </div>
      )}
    </div>
  );
};

const SeloVinculo: React.FC<{ vinculo: string }> = ({ vinculo }) => (
  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
    vinculo === 'Carteira Assinada' ? 'bg-purple-50 text-purple-800' : 'bg-blue-50 text-blue-800'
  }`}>
    {vinculo === 'Carteira Assinada' ? 'CLT' : 'Diarista'}
  </span>
);

const LinhaSemana: React.FC<{
  semana: SemanaDoHistorico;
  mesNome: string;
  podeVerValores: boolean;
  onGerarPdf?: Props['onGerarPdf'];
  onAbrirErros: () => void;
}> = ({ semana, mesNome, podeVerValores, onGerarPdf, onAbrirErros }) => {
  const situacao = semana.status === 'open' ? 'ABERTA' : 'paga';
  return (
    <div className="flex flex-wrap items-center gap-3 px-3 sm:px-4 py-3 sm:pl-7 bg-white border border-gray-200 rounded-md hover:bg-gray-50">
      <div className="flex flex-col min-w-[120px]">
        <span className="text-sm font-semibold text-gray-800">{semana.numero}</span>
        <span className="text-xs font-medium text-gray-500">{semana.intervalo}</span>
      </div>
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold whitespace-nowrap ${
        situacao === 'ABERTA' ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'
      }`}>
        {situacao}
      </span>

      <div className="flex-grow" />

      <div className="flex items-center gap-3 sm:gap-4 flex-wrap justify-end">
        <span className="text-sm font-bold text-green-600">{brl(semana.valor, podeVerValores)}</span>
        <span className="text-[13px] text-gray-700 whitespace-nowrap">
          <b className="text-blue-600">{semana.pagos}</b> pagos{' '}
          <span className="text-gray-400">({semana.pagosDiarista} D · {semana.pagosClt} C)</span>
        </span>
        <span className={`text-[13px] whitespace-nowrap ${semana.descontados > 0 ? 'text-orange-600' : 'text-gray-400'}`}>
          {semana.descontados} descontados
        </span>
        <TagErros
          total={semana.erros} diarista={semana.errosDiarista} clt={semana.errosClt}
          itens={semana.listaErros} onAbrir={onAbrirErros}
        />
        {onGerarPdf && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onGerarPdf({
                titulo: `${semana.numero} (${semana.intervalo}) — ${mesNome}`,
                inicio: semana.startDate,
                fim: semana.endDate,
              });
            }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 min-h-[36px] rounded-md bg-blue-50 border border-blue-200 text-blue-800 text-xs font-semibold hover:bg-blue-100 whitespace-nowrap"
          >
            <FileText size={13} /> PDF
          </button>
        )}
      </div>
    </div>
  );
};

/** A lista completa, separada por vínculo — do mês ou da semana. */
const PopupDeErros: React.FC<{ popup: PopupErros; onFechar: () => void }> = ({ popup, onFechar }) => {
  const blocos = [
    { rotulo: 'Diaristas', vinculo: 'Diarista', tom: 'bg-blue-50 text-blue-800' },
    { rotulo: 'Carteira assinada', vinculo: 'Carteira Assinada', tom: 'bg-purple-50 text-purple-800' },
  ].map((b) => {
    const itens = popup.itens.filter((e) => e.vinculo === b.vinculo);
    const pacotes = itens.reduce((s, e) => s + e.quantidade, 0);
    return { ...b, itens, pacotes };
  });
  const totalPacotes = popup.itens.reduce((s, e) => s + e.quantidade, 0);

  return (
    <div
      className="fixed inset-0 bg-gray-900/60 z-50 flex items-start justify-center p-4 sm:p-10 overflow-auto"
      onClick={onFechar}
      role="presentation"
    >
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-3xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={popup.titulo}
      >
        <div className="flex items-start gap-3 px-5 py-4 border-b border-gray-200">
          <AlertTriangle size={22} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex flex-col">
            <span className="text-[17px] font-bold text-gray-800">{popup.titulo}</span>
            <span className="text-[13px] text-gray-500">{popup.subtitulo}</span>
          </div>
          <div className="flex-grow" />
          <button type="button" onClick={onFechar} aria-label="Fechar" className="p-1 text-gray-500 hover:text-gray-700">
            <X size={22} />
          </button>
        </div>

        <div className="px-5 py-4">
          {blocos.map((b) => (
            <div key={b.vinculo} className="mb-5">
              <div className="flex items-center gap-2 mb-2.5">
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${b.tom}`}>{b.rotulo}</span>
                <span className="text-[13px] font-semibold text-gray-700">
                  {b.itens.length === 0
                    ? 'nenhum erro'
                    : `${b.itens.length === 1 ? '1 erro' : `${b.itens.length} erros`} · ${b.pacotes} pacotes`}
                </span>
              </div>
              {b.itens.length === 0 ? (
                <div className="p-3.5 border border-dashed border-gray-200 rounded-md text-[13px] text-gray-400">
                  Nenhum erro deste tipo no período.
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  {b.itens.map((e) => (
                    <div key={e.id} className="grid grid-cols-1 sm:grid-cols-[1.5fr_1.2fr_90px_2.4fr_96px] gap-1 sm:gap-3 items-center px-3.5 py-3 border-b border-gray-100 last:border-b-0">
                      <span className="text-[13px] font-semibold text-gray-800">{e.nome}</span>
                      <span className="text-xs text-gray-500">{e.equipe}</span>
                      <span className="text-xs text-gray-700">{formatarDia(e.date)}</span>
                      <span className="text-xs text-gray-700 leading-snug">{e.descricao}</span>
                      <span className="text-[13px] font-bold text-red-600 sm:text-right">
                        {e.quantidade} {e.quantidade === 1 ? 'pacote' : 'pacotes'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          <div className="flex items-center justify-between px-4 py-3.5 bg-gray-50 rounded-lg">
            <span className="text-[13px] font-semibold text-gray-700">
              {popup.itens.length === 1 ? '1 erro no total' : `${popup.itens.length} erros no total`}
            </span>
            <span className="text-[15px] font-bold text-red-600">
              {totalPacotes} {totalPacotes === 1 ? 'pacote' : 'pacotes'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

/** `2026-09-05` → `05/09` (sem passar por Date: fuso não muda o dia). */
function formatarDia(iso: string): string {
  const [, m, d] = (iso || '').split('-');
  return d && m ? `${d}/${m}` : iso;
}
