import { useState } from 'react';
import { Loader2, LogIn } from 'lucide-react';
import { useCompany } from '../../../contexts/useCompany';
import { ErroDoSupervisor, entrarComoSupervisor, type SessaoDoSupervisor } from '../../../services/supervisorTablet';

/** Mestres escolhem a empresa da sessão (cruzam empresas, como no resto do sistema). */
const MESTRES = ['9999', '2626'];

/**
 * Login do MODO SUPERVISOR (07/10/2026, entrega E; decisão 4): o código e a senha do PAINEL — não
 * CPF + PIN (PIN de 4 dígitos se descobre tentando). O servidor trava 15 min depois de 5 erros e
 * recusa senha provisória, quem não tem a permissão do tablet e quem não está ligado a um
 * funcionário — a mensagem dele vai direto pra tela.
 */
export function EntrarComoSupervisor({ onEntrou, aviso }: { onEntrou: (s: SessaoDoSupervisor) => void; aviso: string | null }) {
  const { availableCompanies } = useCompany();
  const [codigo, setCodigo] = useState('');
  const [senha, setSenha] = useState('');
  const [empresa, setEmpresa] = useState('');
  const [entrando, setEntrando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const ehMestre = MESTRES.includes(codigo.trim());

  const entrar = async () => {
    setEntrando(true);
    setErro(null);
    try {
      const sessao = await entrarComoSupervisor(codigo.trim(), senha, ehMestre && empresa ? empresa : undefined);
      setSenha('');
      onEntrou(sessao);
    } catch (err) {
      setErro(err instanceof ErroDoSupervisor ? err.message : 'Sem conexão com o servidor. Tente de novo.');
    } finally {
      setEntrando(false);
    }
  };

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => { e.preventDefault(); if (codigo.trim() && senha) void entrar(); }}
      data-testid="supervisor-login"
    >
      {aviso && <p className="text-sm text-amber-800 bg-amber-100 rounded-lg px-3 py-2">{aviso}</p>}
      <div>
        <label htmlFor="sup-codigo" className="block text-sm font-semibold text-gray-700 mb-1">Seu código do painel</label>
        <input
          id="sup-codigo"
          inputMode="numeric"
          autoComplete="username"
          value={codigo}
          onChange={(e) => setCodigo(e.target.value.replace(/\D/g, '').slice(0, 10))}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg focus:border-blue-500 focus:outline-none"
        />
      </div>
      <div>
        <label htmlFor="sup-senha" className="block text-sm font-semibold text-gray-700 mb-1">Senha do painel</label>
        <input
          id="sup-senha"
          type="password"
          autoComplete="current-password"
          value={senha}
          onChange={(e) => setSenha(e.target.value)}
          className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl text-lg focus:border-blue-500 focus:outline-none"
        />
      </div>
      {ehMestre && (
        <div>
          <label htmlFor="sup-empresa" className="block text-sm font-semibold text-gray-700 mb-1">Empresa</label>
          <select
            id="sup-empresa"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl bg-white focus:border-blue-500 focus:outline-none"
          >
            <option value="">A empresa do meu usuário</option>
            {availableCompanies.map((c) => <option key={c.id} value={c.id}>{c.display_name}</option>)}
          </select>
        </div>
      )}
      {erro && <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2" role="alert" data-testid="supervisor-login-erro">{erro}</p>}
      <button
        type="submit"
        disabled={!codigo.trim() || !senha || entrando}
        className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center gap-2 min-h-[52px]"
      >
        {entrando ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
        Entrar como supervisor
      </button>
    </form>
  );
}
