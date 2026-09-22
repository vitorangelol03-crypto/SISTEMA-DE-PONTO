/**
 * "O QUE FALTA PRA FOLHA SAIR" — o cartão que quebra o silêncio (22/09/2026).
 *
 * A folha é honesta: sem salário na ficha, a pessoa não ganha linha nenhuma; sem data de
 * admissão, o direito de férias não é calculado. O problema é que isso acontece **calado** —
 * quem abre o Financeiro vê "não tem nada" em vez de "falta preencher". Em Caratinga, hoje,
 * são 14 de 14 fichas de carteira assinada sem salário.
 *
 * Este cartão só aparece quando há o que preencher, e some sozinho quando a ficha fica
 * completa. Ele não calcula nem muda nada: lê a ficha e mostra quem falta, com nome.
 */
import React, { useEffect, useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronUp, Loader2 } from 'lucide-react';
import { getAllEmployees, type Company } from '../../services/database';
import {
  pendenciasDeCadastro,
  quantasPessoasComPendencia,
  type Pendencia,
} from '../../utils/folha/pendenciasDeCadastro';

const TITULO: Record<Pendencia['tipo'], string> = {
  'sem-salario': 'Sem salário na ficha',
  'sem-admissao': 'Sem data de admissão',
  'fgts-desligado': 'FGTS desligado na ficha',
  'cadastro-pendente': 'Cadastro ainda não aprovado',
  'vinculo-divergente': 'Os dois campos de vínculo discordam',
};

interface Props {
  company: Company;
  /** Recarrega quando o Financeiro recarrega (a pessoa pode ter acabado de preencher). */
  recarga?: number;
}

export const PendenciasDaFolhaCard: React.FC<Props> = ({ company, recarga }) => {
  const [pendencias, setPendencias] = useState<Pendencia[] | null>(null);
  const [aberto, setAberto] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        // Sem filtro de vínculo de propósito: o filtro da tela pode estar em "Diarista" e
        // esconderia justamente quem tem pendência de carteira assinada.
        const fichas = await getAllEmployees(undefined, company.id);
        if (vivo) setPendencias(pendenciasDeCadastro(fichas));
      } catch (e) {
        // Falhar aqui não pode derrubar o Financeiro: o cartão só some.
        console.error('Não consegui ler as pendências de cadastro da folha:', e);
        if (vivo) setPendencias([]);
      }
    })();
    return () => { vivo = false; };
  }, [company.id, recarga]);

  if (pendencias === null) {
    return (
      <div className="flex items-center gap-2 text-xs text-gray-500 px-1 py-2">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Conferindo as fichas…
      </div>
    );
  }
  if (pendencias.length === 0) return null;

  const pessoas = quantasPessoasComPendencia(pendencias);

  return (
    <div
      className="bg-amber-50 border border-amber-300 rounded-lg p-3 sm:p-4 mb-4"
      data-testid="folha-pendencias"
    >
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full flex items-start gap-2 text-left"
      >
        <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-amber-900">
            Falta preencher a ficha de {pessoas} {pessoas === 1 ? 'pessoa' : 'pessoas'} para a folha sair certa
          </p>
          <p className="text-xs text-amber-800 mt-0.5">
            {pendencias.map((p) => `${TITULO[p.tipo]}: ${p.pessoas.length}`).join(' · ')}
          </p>
        </div>
        {aberto
          ? <ChevronUp className="w-4 h-4 text-amber-700 flex-shrink-0" />
          : <ChevronDown className="w-4 h-4 text-amber-700 flex-shrink-0" />}
      </button>

      {aberto && (
        <div className="mt-3 space-y-3">
          {pendencias.map((p) => (
            <div key={p.tipo} className="bg-white/70 rounded-lg p-3 border border-amber-200">
              <p className="text-sm font-semibold text-amber-900">
                {TITULO[p.tipo]} ({p.pessoas.length})
              </p>
              <p className="text-xs text-amber-800 mt-0.5">{p.efeito}</p>
              <ul className="mt-2 text-xs text-gray-700 grid sm:grid-cols-2 gap-x-4 gap-y-1">
                {p.pessoas.map((pessoa) => (
                  <li key={pessoa.id} className="truncate">
                    • {pessoa.name}
                    {pessoa.detalhe && <span className="text-gray-500"> ({pessoa.detalhe})</span>}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <p className="text-xs text-amber-800">
            Preencha em <strong>Funcionários → a ficha da pessoa</strong>. Assim que o dado entrar,
            a folha, o 13º, as férias e a rescisão passam a sair para ela — e este aviso some sozinho.
          </p>
        </div>
      )}
    </div>
  );
};
