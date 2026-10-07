import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, RefreshCw, ScanFace, Search, UserPlus } from 'lucide-react';
import { contemSemAcento } from '../../../utils/buscaTexto';
import {
  ErroDoSupervisor, listarFuncionariosDoSupervisor, type FuncionarioDoSupervisor, type OQueOSupervisorPode,
} from '../../../services/supervisorTablet';

/**
 * A lista do supervisor (07/10/2026, entrega E) — só depois do QR de conectar lido. Busca sem
 * acento, selos de situação e as ações que a permissão dele deixa: "Cadastrar novo" e, por pessoa,
 * "Refazer rosto". O servidor nunca manda o CPF inteiro, o rosto ou o PIN.
 */
export function PainelDoSupervisor({ session, pode, onCadastrar, onRefazer, onSessaoAcabou }: {
  session: string;
  pode: OQueOSupervisorPode;
  onCadastrar: () => void;
  onRefazer: (f: FuncionarioDoSupervisor) => void;
  onSessaoAcabou: () => void;
}) {
  const [lista, setLista] = useState<FuncionarioDoSupervisor[] | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [busca, setBusca] = useState('');

  const carregar = useCallback(async () => {
    setErro(null);
    try {
      const r = await listarFuncionariosDoSupervisor(session);
      setLista(r.funcionarios.filter((f) => !f.desligado && f.status !== 'rejected'));
    } catch (err) {
      if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão. Tente de novo.');
    }
  }, [session, onSessaoAcabou]);

  useEffect(() => { void carregar(); }, [carregar]);

  const filtrados = useMemo(() => (lista ?? []).filter((f) => contemSemAcento(f.nome, busca)), [lista, busca]);

  return (
    <div className="space-y-3" data-testid="painel-do-supervisor">
      {pode.cadastrar && (
        <button
          type="button"
          onClick={onCadastrar}
          className="w-full py-3 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 flex items-center justify-center gap-2 min-h-[48px]"
        >
          <UserPlus className="w-5 h-5" /> Cadastrar funcionário novo
        </button>
      )}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar pelo nome…"
          aria-label="Buscar funcionário pelo nome"
          className="w-full pl-9 pr-3 py-3 border border-gray-300 rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
      </div>
      {erro ? (
        <div className="text-center space-y-2">
          <p className="text-sm text-red-700" role="alert">{erro}</p>
          <button type="button" onClick={() => void carregar()} className="text-sm text-blue-700 font-semibold inline-flex items-center gap-1">
            <RefreshCw className="w-4 h-4" /> Tentar de novo
          </button>
        </div>
      ) : lista === null ? (
        <p className="text-sm text-gray-500 flex items-center gap-2 justify-center py-4"><Loader2 className="w-4 h-4 animate-spin" /> Carregando funcionários…</p>
      ) : filtrados.length === 0 ? (
        <p className="text-sm text-gray-500 text-center py-4">{lista.length === 0 ? 'Nenhum funcionário nesta empresa.' : 'Nenhum funcionário encontrado.'}</p>
      ) : (
        <ul className="divide-y divide-gray-100 border border-gray-200 rounded-xl bg-white" data-testid="lista-do-supervisor">
          {filtrados.map((f) => (
            <li key={f.id} className="p-3 flex items-center gap-2">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900 truncate">{f.nome}</p>
                <p className="text-xs text-gray-500 truncate">{[f.funcao, f.cpfFinal && `CPF ${f.cpfFinal}`].filter(Boolean).join(' · ')}</p>
                <div className="flex flex-wrap gap-1 mt-1">
                  {!f.temRosto && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">sem rosto</span>}
                  {f.pediuNovoRosto && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-800">pediu novo rosto</span>}
                  {f.status === 'pending' && <span className="text-[11px] font-semibold px-1.5 py-0.5 rounded bg-gray-100 text-gray-700">pendente</span>}
                </div>
              </div>
              {pode.refazerRosto && (
                <button
                  type="button"
                  onClick={() => onRefazer(f)}
                  className="px-3 py-2 text-sm font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg min-h-[40px] inline-flex items-center gap-1"
                >
                  <ScanFace className="w-4 h-4" /> {f.temRosto ? 'Refazer rosto' : 'Cadastrar rosto'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
