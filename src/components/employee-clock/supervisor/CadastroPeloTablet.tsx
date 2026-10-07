import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2, Save } from 'lucide-react';
import { formatCPF, formatPhoneDisplay, sanitizePhoneDigits, validateCPF, validatePhoneDigits } from '../../../utils/validation';
import {
  ErroDoSupervisor, cadastrarPeloTablet, listarFuncoesDoSupervisor,
} from '../../../services/supervisorTablet';

export interface FuncionarioEscolhido {
  employeeId: string;
  nome: string;
}

/**
 * "Cadastrar novo" pelo celular do supervisor (07/10/2026, entrega E; decisões 5 e 6). Entra como
 * DIARISTA, PENDENTE (Aprovação de Cadastro) e sem PIX — o servidor grava assim. A função vem da
 * lista da empresa (nunca texto livre: o desconto da triagem compara a função). CPF já cadastrado:
 * o servidor devolve a ficha que existe e a tela oferece refazer o rosto.
 */
export function CadastroPeloTablet({ session, podeRefazer, onCadastrado, onJaExiste, onVoltar, onSessaoAcabou }: {
  session: string;
  podeRefazer: boolean;
  onCadastrado: (f: FuncionarioEscolhido) => void;
  onJaExiste: (f: FuncionarioEscolhido) => void;
  onVoltar: () => void;
  onSessaoAcabou: () => void;
}) {
  const [nome, setNome] = useState('');
  const [cpf, setCpf] = useState('');
  const [telefone, setTelefone] = useState('');
  const [funcao, setFuncao] = useState('');
  const [funcoes, setFuncoes] = useState<string[] | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [jaExiste, setJaExiste] = useState<FuncionarioEscolhido | null>(null);
  const [tocado, setTocado] = useState(false);

  useEffect(() => {
    let cancelado = false;
    listarFuncoesDoSupervisor(session)
      .then((r) => { if (!cancelado) setFuncoes(r.funcoes); })
      .catch((err: unknown) => {
        if (cancelado) return;
        if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
        setErro(err instanceof ErroDoSupervisor ? err.message : 'Não foi possível carregar as funções.');
        setFuncoes([]);
      });
    return () => { cancelado = true; };
  }, [session, onSessaoAcabou]);

  const cpfOk = validateCPF(cpf);
  const telefoneOk = validatePhoneDigits(sanitizePhoneDigits(telefone));
  const nomeOk = (nome.match(/[A-Za-zÀ-ÿ]/g) ?? []).length >= 3;
  const funcaoOk = funcao.trim() !== '';
  const tudoOk = cpfOk && telefoneOk && nomeOk && funcaoOk;

  const salvar = async () => {
    setTocado(true);
    if (!tudoOk) return;
    setSalvando(true);
    setErro(null);
    try {
      const r = await cadastrarPeloTablet(session, { name: nome, cpf, phone: sanitizePhoneDigits(telefone), functionRole: funcao });
      if (r.jaExiste) setJaExiste({ employeeId: r.employeeId, nome: r.nome });
      else onCadastrado({ employeeId: r.employeeId, nome: r.nome });
    } catch (err) {
      if (err instanceof ErroDoSupervisor && err.status === 401) { onSessaoAcabou(); return; }
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão. Tente de novo.');
    } finally {
      setSalvando(false);
    }
  };

  if (jaExiste) {
    return (
      <div className="space-y-3 text-center" data-testid="cpf-ja-cadastrado">
        <p className="text-gray-900">Esse CPF já está cadastrado: <strong>{jaExiste.nome}</strong>.</p>
        {podeRefazer ? (
          <button type="button" onClick={() => onJaExiste(jaExiste)} className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 min-h-[48px]">
            Refazer o rosto de {jaExiste.nome.split(' ')[0]}
          </button>
        ) : (
          <p className="text-sm text-gray-600">Você não tem permissão de refazer rosto — fale com o responsável.</p>
        )}
        <button type="button" onClick={onVoltar} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]">Voltar à lista</button>
      </div>
    );
  }

  const campo = 'w-full px-3 py-3 border-2 rounded-xl text-base focus:outline-none focus:border-blue-500';
  const borda = (ok: boolean) => (tocado && !ok ? 'border-red-400' : 'border-gray-300');
  return (
    <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void salvar(); }} data-testid="cadastro-pelo-tablet">
      <button type="button" onClick={onVoltar} className="text-sm text-gray-600 inline-flex items-center gap-1"><ArrowLeft className="w-4 h-4" /> Voltar</button>
      <h2 className="text-lg font-bold text-gray-900">Cadastrar funcionário novo</h2>
      <p className="text-xs text-gray-500">Entra como diarista, pendente de aprovação. PIX e o resto da ficha se completam no painel.</p>
      <div>
        <label htmlFor="cad-nome" className="block text-sm font-semibold text-gray-700 mb-1">Nome completo *</label>
        <input id="cad-nome" value={nome} onChange={(e) => setNome(e.target.value)} className={`${campo} ${borda(nomeOk)}`} />
        {tocado && !nomeOk && <p className="text-xs text-red-600 mt-1">Escreva o nome completo.</p>}
      </div>
      <div>
        <label htmlFor="cad-cpf" className="block text-sm font-semibold text-gray-700 mb-1">CPF *</label>
        <input id="cad-cpf" inputMode="numeric" value={formatCPF(cpf)} onChange={(e) => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))} className={`${campo} ${borda(cpfOk)}`} />
        {tocado && !cpfOk && <p className="text-xs text-red-600 mt-1">CPF inválido — confira os números.</p>}
      </div>
      <div>
        <label htmlFor="cad-telefone" className="block text-sm font-semibold text-gray-700 mb-1">Telefone *</label>
        <input id="cad-telefone" inputMode="tel" value={formatPhoneDisplay(telefone)} onChange={(e) => setTelefone(sanitizePhoneDigits(e.target.value))} className={`${campo} ${borda(telefoneOk)}`} />
        {tocado && !telefoneOk && <p className="text-xs text-red-600 mt-1">DDD + número.</p>}
      </div>
      <div>
        <label htmlFor="cad-funcao" className="block text-sm font-semibold text-gray-700 mb-1">Função *</label>
        {funcoes === null ? (
          <p className="text-sm text-gray-500 flex items-center gap-2"><Loader2 className="w-4 h-4 animate-spin" /> Carregando funções…</p>
        ) : funcoes.length > 0 ? (
          <select id="cad-funcao" value={funcao} onChange={(e) => setFuncao(e.target.value)} className={`${campo} ${borda(funcaoOk)} bg-white`}>
            <option value="">Escolha…</option>
            {funcoes.map((f) => <option key={f} value={f}>{f}</option>)}
          </select>
        ) : (
          <input id="cad-funcao" value={funcao} onChange={(e) => setFuncao(e.target.value)} className={`${campo} ${borda(funcaoOk)}`} placeholder="A empresa ainda não tem funções" />
        )}
        {tocado && !funcaoOk && <p className="text-xs text-red-600 mt-1">Escolha a função.</p>}
      </div>
      {erro && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert" data-testid="cadastro-erro">{erro}</p>}
      <button type="submit" disabled={salvando} className="w-full py-4 bg-green-600 text-white font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[52px]">
        {salvando ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />} Salvar e cadastrar o rosto
      </button>
    </form>
  );
}
