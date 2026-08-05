import React, { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown, X } from 'lucide-react';

/**
 * Filtro de MARCAR VÁRIOS (05/08/2026, pedido do Victor: "usar mais de um filtro ao mesmo
 * tempo combinados").
 *
 * Um `<select>` comum só aceita um valor, e `multiple` nativo é intragável no celular
 * (lista cinza que exige Ctrl pra marcar). Então: um botão que abre um painel de caixinhas.
 *
 * ⚠️ O texto do `regra` aparece embaixo do rótulo de propósito. Filtro que esconde gente
 * sem dizer a regra é como o Victor perde entregador de vista na hora de pagar — "as duas"
 * e "qualquer um" têm que estar ESCRITOS, não adivinhados.
 */
interface MultiSelectFilterProps {
  label: string;
  /** A regra em português, mostrada na tela: "quem tem TODAS as marcadas", etc. */
  regra: string;
  /** Texto quando nada está marcado. */
  vazio: string;
  options: string[];
  selected: string[];
  onToggle: (value: string) => void;
  onClear: () => void;
}

const FIELD =
  'w-full px-3 py-2 border rounded-md text-sm text-left flex items-center justify-between gap-2 min-h-[40px] focus:outline-none focus:ring-2 focus:ring-blue-500/30';

export const MultiSelectFilter: React.FC<MultiSelectFilterProps> = ({
  label,
  regra,
  vazio,
  options,
  selected,
  onToggle,
  onClear,
}) => {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // Fecha ao clicar fora ou apertar Esc — senão o painel fica "grudado" por cima da lista.
  useEffect(() => {
    if (!aberto) return;
    const foraDaqui = (e: MouseEvent) => {
      if (caixa.current && !caixa.current.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setAberto(false);
    };
    document.addEventListener('mousedown', foraDaqui);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', foraDaqui);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const temFiltro = selected.length > 0;
  // 1 marcado mostra o nome; de 2 em diante mostra a contagem (nome de grupo é comprido).
  const resumo = !temFiltro ? vazio : selected.length === 1 ? selected[0] : `${selected.length} selecionados`;

  return (
    <div className="flex flex-col gap-1" ref={caixa}>
      <label className="text-sm font-medium text-gray-700">
        {label} <span className="font-normal text-gray-400">· {regra}</span>
      </label>
      <div className="relative">
        <button
          type="button"
          onClick={() => setAberto((v) => !v)}
          aria-expanded={aberto}
          className={`${FIELD} ${
            temFiltro ? 'border-blue-500 bg-blue-50 text-blue-800 font-medium' : 'border-gray-300 bg-white text-gray-700'
          }`}
        >
          <span className="truncate">{resumo}</span>
          <span className="flex items-center gap-1 shrink-0">
            {temFiltro && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Limpar filtro de ${label}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    e.stopPropagation();
                    onClear();
                  }
                }}
                className="p-0.5 rounded hover:bg-blue-200"
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className={`w-4 h-4 transition-transform ${aberto ? 'rotate-180' : ''}`} />
          </span>
        </button>

        {aberto && (
          <div className="absolute z-30 mt-1 w-full max-h-64 overflow-y-auto rounded-md border border-gray-300 bg-white shadow-lg">
            {options.length === 0 ? (
              <p className="px-3 py-2 text-sm text-gray-500">Nada para escolher aqui.</p>
            ) : (
              options.map((op) => {
                const marcado = selected.includes(op);
                return (
                  <button
                    key={op}
                    type="button"
                    onClick={() => onToggle(op)}
                    className={`w-full px-3 py-2 text-sm text-left flex items-center gap-2 hover:bg-gray-50 ${
                      marcado ? 'text-blue-700 font-medium' : 'text-gray-700'
                    }`}
                  >
                    <span
                      className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                        marcado ? 'bg-blue-600 border-blue-600' : 'border-gray-300'
                      }`}
                    >
                      {marcado && <Check className="w-3 h-3 text-white" />}
                    </span>
                    <span className="truncate">{op}</span>
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
