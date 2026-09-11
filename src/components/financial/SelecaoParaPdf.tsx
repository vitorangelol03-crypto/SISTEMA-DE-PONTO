/**
 * QUEM ENTRA NO PDF — a lista que abre ao clicar em "Gerar PDF" numa gaveta.
 *
 * Pedido do Victor (10/09/2026): *"quando clicar para gerar o pdf te dá opção de
 * filtrar, abre um popup com lista dos funcionários; podem separar diarista ou
 * carteira assinada, ou tirar somente de alguns — diarista junto com carteira
 * assinada"*.
 *
 * Por isso o filtro de vínculo **não desmarca ninguém**: ele só muda QUEM APARECE.
 * Dá pra marcar todos os diaristas, trocar pra carteira assinada, marcar mais dois
 * e gerar os dois grupos juntos — que é exatamente o "misturar" que ele pediu.
 * A contagem no rodapé sempre mostra o total escolhido, não o da tela.
 */

import React, { useMemo, useState } from 'react';
import { X, FileText, Users, Check, Search } from 'lucide-react';
import type { Vinculo } from '../../utils/historicoPagamentos';

export interface PessoaDoPdf {
  id: string;
  nome: string;
  vinculo: Vinculo;
  /** O líquido do período — o mesmo número que vai no papel. */
  valor: number;
  /** A equipe/função, pra reconhecer homônimo. */
  equipe: string;
}

interface Props {
  titulo: string;
  subtitulo: string;
  pessoas: PessoaDoPdf[];
  /** A busca do período ainda está rodando: a lista não é confiável ainda. */
  carregando: boolean;
  podeVerValores: boolean;
  /** `null` enquanto nada está sendo gerado; senão, o texto do progresso. */
  gerando: string | null;
  /** Quem DESTE período já recebeu o recibo no app (selo "no app"). */
  jaPublicados: Set<string>;
  onFechar: () => void;
  onGerar: (ids: string[]) => void;
  /**
   * Publicar é AÇÃO SEPARADA de baixar — decisão do Victor (10/09/2026):
   * *"pode deixar separado mesmo"*, pra conferir o papel antes de mandar.
   */
  onPublicar: (ids: string[]) => void;
}

type FiltroVinculo = 'todos' | Vinculo;

const brl = (v: number, pode: boolean) =>
  pode ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '•••';

export const SelecaoParaPdf: React.FC<Props> = ({
  titulo, subtitulo, pessoas, carregando, podeVerValores, gerando, jaPublicados,
  onFechar, onGerar, onPublicar,
}) => {
  const [filtro, setFiltro] = useState<FiltroVinculo>('todos');
  const [busca, setBusca] = useState('');
  // Começa com TODO MUNDO marcado: o caso comum é gerar a folha inteira, e tirar
  // dois é menos trabalho do que marcar quarenta.
  const [desmarcados, setDesmarcados] = useState<Set<string>>(new Set());

  const visiveis = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return pessoas.filter((p) =>
      (filtro === 'todos' || p.vinculo === filtro)
      && (q === '' || p.nome.toLowerCase().includes(q)));
  }, [pessoas, filtro, busca]);

  const marcado = (id: string) => !desmarcados.has(id);
  const escolhidos = pessoas.filter((p) => marcado(p.id));

  const alternar = (id: string) => setDesmarcados((s) => {
    const novo = new Set(s);
    if (novo.has(id)) novo.delete(id); else novo.add(id);
    return novo;
  });

  /** Marca/desmarca SÓ o que está na tela — é o que faz "só os diaristas" funcionar. */
  const marcarVisiveis = (marcar: boolean) => setDesmarcados((s) => {
    const novo = new Set(s);
    for (const p of visiveis) { if (marcar) novo.delete(p.id); else novo.add(p.id); }
    return novo;
  });

  const contarPor = (v: Vinculo) => pessoas.filter((p) => p.vinculo === v).length;
  const escolhidosD = escolhidos.filter((p) => p.vinculo === 'Diarista').length;
  const escolhidosC = escolhidos.length - escolhidosD;

  return (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-center justify-center p-4" onClick={onFechar}>
      <div
        className="bg-white rounded-lg shadow-xl w-full max-w-2xl flex flex-col max-h-[88vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 py-4 border-b border-gray-200">
          <div>
            <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
              <FileText size={18} className="text-green-600" /> {titulo}
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">{subtitulo}</p>
          </div>
          <button onClick={onFechar} className="text-gray-400 hover:text-gray-700 p-1" aria-label="Fechar">
            <X size={20} />
          </button>
        </div>

        {carregando ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
            Buscando quem foi pago nesse período…
          </div>
        ) : pessoas.length === 0 ? (
          <div className="px-5 py-12 text-center">
            <Users className="w-10 h-10 mx-auto mb-3 text-gray-300" />
            <p className="text-sm font-medium text-gray-700">Ninguém foi pago nesse período.</p>
            <p className="text-xs text-gray-500 mt-1">Sem pagamento não há o que imprimir no recibo.</p>
          </div>
        ) : (
          <>
            {/* ── Filtro de vínculo: muda quem APARECE, não desmarca ninguém ── */}
            <div className="px-5 py-3 border-b border-gray-100 space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {([
                  ['todos', `Todos (${pessoas.length})`],
                  ['Diarista', `Diaristas (${contarPor('Diarista')})`],
                  ['Carteira Assinada', `Carteira assinada (${contarPor('Carteira Assinada')})`],
                ] as [FiltroVinculo, string][]).map(([v, texto]) => (
                  <button
                    key={v} type="button" onClick={() => setFiltro(v)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold border ${
                      filtro === v
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {texto}
                  </button>
                ))}
                <div className="flex-grow" />
                <button type="button" onClick={() => marcarVisiveis(true)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-blue-600 hover:bg-blue-50 rounded-lg">
                  Marcar os {visiveis.length} da tela
                </button>
                <button type="button" onClick={() => marcarVisiveis(false)}
                  className="px-2.5 py-1.5 text-xs font-semibold text-gray-500 hover:bg-gray-100 rounded-lg">
                  Desmarcar
                </button>
              </div>

              <div className="relative">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                <input
                  value={busca} onChange={(e) => setBusca(e.target.value)}
                  placeholder="Procurar pelo nome…"
                  className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>

            <div className="overflow-y-auto flex-1">
              {visiveis.length === 0 ? (
                <p className="px-5 py-8 text-center text-sm text-gray-500">Ninguém com esse filtro.</p>
              ) : visiveis.map((p) => (
                <label
                  key={p.id}
                  className="flex items-center gap-3 px-5 py-2.5 border-b border-gray-100 hover:bg-gray-50 cursor-pointer"
                >
                  <span className={`w-5 h-5 rounded border flex items-center justify-center flex-shrink-0 ${
                    marcado(p.id) ? 'bg-blue-600 border-blue-600' : 'bg-white border-gray-300'
                  }`}>
                    {marcado(p.id) && <Check size={14} className="text-white" />}
                  </span>
                  <input
                    type="checkbox" className="sr-only"
                    checked={marcado(p.id)} onChange={() => alternar(p.id)}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{p.nome}</div>
                    {p.equipe && <div className="text-[11px] text-gray-500 truncate">{p.equipe}</div>}
                  </div>
                  {jaPublicados.has(p.id) && (
                    <span
                      className="px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap bg-green-100 text-green-800"
                      title="Esta pessoa já recebeu o recibo deste período no app. Publicar de novo substitui o que está lá."
                    >
                      no app
                    </span>
                  )}
                  <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-semibold whitespace-nowrap ${
                    p.vinculo === 'Carteira Assinada' ? 'bg-purple-50 text-purple-800' : 'bg-blue-50 text-blue-800'
                  }`}>
                    {p.vinculo === 'Carteira Assinada' ? 'Carteira assinada' : 'Diarista'}
                  </span>
                  <span className="text-sm font-semibold text-green-600 w-28 text-right">
                    {brl(p.valor, podeVerValores)}
                  </span>
                </label>
              ))}
            </div>

            <div className="px-5 py-3.5 border-t border-gray-200 flex flex-wrap items-center gap-3 bg-gray-50 rounded-b-lg">
              <div className="text-xs text-gray-600">
                <b className="text-gray-900">{escolhidos.length}</b> escolhidos
                {escolhidos.length > 0 && <> — {escolhidosD} diarista{escolhidosD === 1 ? '' : 's'} · {escolhidosC} carteira assinada</>}
              </div>
              <div className="flex-grow" />
              <button type="button" onClick={onFechar}
                className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-200 rounded-lg">
                Cancelar
              </button>
              <button
                type="button"
                disabled={escolhidos.length === 0 || gerando !== null}
                onClick={() => onGerar(escolhidos.map((p) => p.id))}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:text-gray-300 disabled:cursor-not-allowed"
              >
                {escolhidos.length === 1 ? 'Baixar 1 recibo' : `Baixar ${escolhidos.length} (.zip)`}
              </button>
              {/* Publicar é o OUTRO botão de propósito: baixar é pra conferir,
                  publicar é o que a pessoa passa a ver no celular dela. */}
              <button
                type="button"
                disabled={escolhidos.length === 0 || gerando !== null}
                onClick={() => onPublicar(escolhidos.map((p) => p.id))}
                title="Manda o recibo pro app do funcionário, na aba de erros dele"
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
              >
                {gerando ?? (escolhidos.length === 1
                  ? 'Publicar pro funcionário'
                  : `Publicar pros ${escolhidos.length}`)}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
