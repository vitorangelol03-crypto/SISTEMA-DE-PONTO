import { useEffect, useMemo, useState } from 'react';
import { Link2, Loader2, Search, Unlink, UserCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import { getFuncionariosParaVinculo, linkUserEmployee, type FuncionarioParaVinculo } from '../../services/database';
import { getBrazilDate } from '../../utils/dateUtils';
import { mensagemDeErro } from '../../utils/mensagemDeErro';
import { filtrarParaVinculo, finalDoCpf } from './vinculoFuncionario';

export interface VinculoAtual {
  id: string;
  nome: string;
}

interface Props {
  /** O usuário do painel que está sendo configurado. */
  userId: string;
  /** A empresa DESSE usuário — a lista é dela, não da empresa escolhida no painel. */
  companyId: string | null | undefined;
  vinculo: VinculoAtual | null;
  onMudou: (vinculo: VinculoAtual | null) => void;
}

/**
 * "Funcionário vinculado" — no topo da tela de Permissões (07/10/2026, plano do tablet sem toque,
 * entrega C, decisão 10). Liga o usuário do painel a UM funcionário da empresa dele: é assim que o
 * histórico do modo supervisor do tablet vai dizer quem fez (usuário + funcionário + tablet).
 * Obrigatório pra quem tiver as permissões do tablet; opcional pros outros.
 *
 * Salva NA HORA, pela função do banco (o vínculo não faz parte do "Salvar Permissões"): é o banco
 * que confere quem pode ligar e quem pode ser ligado, e grava no histórico.
 */
export function VinculoDoFuncionario({ userId, companyId, vinculo, onMudou }: Props) {
  const [lista, setLista] = useState<FuncionarioParaVinculo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erroDaLista, setErroDaLista] = useState<string | null>(null);
  const [busca, setBusca] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [recusa, setRecusa] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) {
      setCarregando(false);
      setErroDaLista('Este usuário está sem empresa — não dá pra escolher funcionário.');
      return;
    }
    let cancelado = false;
    setCarregando(true);
    setErroDaLista(null);
    getFuncionariosParaVinculo(companyId)
      .then((l) => { if (!cancelado) setLista(l); })
      .catch((err: unknown) => {
        if (!cancelado) setErroDaLista(mensagemDeErro(err, 'Não foi possível carregar os funcionários.'));
      })
      .finally(() => { if (!cancelado) setCarregando(false); });
    return () => { cancelado = true; };
  }, [companyId]);

  const hoje = getBrazilDate();
  const opcoes = useMemo(() => filtrarParaVinculo(lista, busca, hoje), [lista, busca, hoje]);
  const cpfDoVinculo = vinculo ? finalDoCpf(lista.find((f) => f.id === vinculo.id)?.cpf) : '';

  const salvar = async (escolhido: FuncionarioParaVinculo | null) => {
    setSalvando(true);
    setRecusa(null);
    try {
      await linkUserEmployee(userId, escolhido?.id ?? null);
      onMudou(escolhido ? { id: escolhido.id, nome: escolhido.name } : null);
      setBusca('');
      toast.success(escolhido ? `Vínculo salvo: ${escolhido.name}` : 'Vínculo removido');
    } catch (err) {
      // O motivo do banco vai pra tela ("Esse funcionário já está ligado ao usuário 03.").
      const motivo = mensagemDeErro(err, 'Não foi possível salvar o vínculo.');
      setRecusa(motivo);
      toast.error(motivo);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <section className="border border-indigo-200 bg-indigo-50/60 rounded-lg p-3 sm:p-4 space-y-3" data-testid="vinculo-funcionario">
      <div className="flex items-start gap-2">
        <Link2 className="w-5 h-5 text-indigo-700 mt-0.5 flex-shrink-0" />
        <div className="min-w-0">
          <h3 className="font-semibold text-gray-900">Funcionário vinculado</h3>
          <p className="text-xs text-gray-600">
            Quem este usuário é entre os funcionários — obrigatório pra usar as permissões do tablet.
          </p>
        </div>
      </div>

      {vinculo ? (
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-white border border-indigo-200 rounded-md p-2">
          <UserCheck className="w-5 h-5 text-green-600 flex-shrink-0" />
          <p className="flex-1 min-w-0 text-sm text-gray-800 truncate" data-testid="vinculo-atual">
            <strong>{vinculo.nome}</strong>{cpfDoVinculo ? <span className="text-gray-500"> · CPF {cpfDoVinculo}</span> : null}
          </p>
          <button
            type="button"
            onClick={() => void salvar(null)}
            disabled={salvando}
            className="inline-flex items-center justify-center gap-1 px-3 py-2 text-sm text-red-700 hover:bg-red-50 rounded-md min-h-[40px] disabled:opacity-50"
          >
            <Unlink className="w-4 h-4" /> Remover vínculo
          </button>
        </div>
      ) : (
        <p className="text-sm text-gray-600" data-testid="vinculo-atual">Sem vínculo.</p>
      )}

      {carregando ? (
        <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando funcionários…</p>
      ) : erroDaLista ? (
        <p className="text-sm text-red-700" data-testid="vinculo-erro-lista">{erroDaLista}</p>
      ) : lista.length === 0 ? (
        <p className="text-sm text-gray-500">Nenhum funcionário nesta empresa.</p>
      ) : (
        <div className="space-y-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={vinculo ? 'Trocar: buscar outro funcionário pelo nome…' : 'Buscar funcionário pelo nome…'}
              aria-label="Buscar funcionário pelo nome"
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent min-h-[44px] text-sm bg-white"
            />
          </div>
          {busca.trim() !== '' && (
            opcoes.length === 0 ? (
              <p className="text-sm text-gray-500">Ninguém com esse nome (desligados e cadastros recusados não aparecem).</p>
            ) : (
              <ul className="bg-white border border-gray-200 rounded-md divide-y divide-gray-100" data-testid="vinculo-opcoes">
                {opcoes.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 p-2">
                    <span className="flex-1 min-w-0 text-sm text-gray-800 truncate">
                      {f.name}{finalDoCpf(f.cpf) ? <span className="text-gray-500"> · CPF {finalDoCpf(f.cpf)}</span> : null}
                    </span>
                    {vinculo?.id === f.id ? (
                      <span className="text-xs text-green-700 font-semibold px-2">Já ligado</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => void salvar(f)}
                        disabled={salvando}
                        className="px-3 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md min-h-[40px] disabled:opacity-50"
                      >
                        {salvando ? 'Salvando…' : 'Ligar'}
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )
          )}
        </div>
      )}

      {recusa && <p className="text-sm text-red-700" role="alert" data-testid="vinculo-recusa">{recusa}</p>}
    </section>
  );
}
