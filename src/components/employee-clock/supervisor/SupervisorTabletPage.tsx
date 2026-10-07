import { useCallback, useEffect, useState } from 'react';
import { LogOut, ShieldCheck } from 'lucide-react';
import {
  sairDoModoSupervisor, type FuncionarioDoSupervisor, type SessaoDoSupervisor,
} from '../../../services/supervisorTablet';
import { CadastroPeloTablet, type FuncionarioEscolhido } from './CadastroPeloTablet';
import { ConectarAoTablet } from './ConectarAoTablet';
import { EntrarComoSupervisor } from './EntrarComoSupervisor';
import { PainelDoSupervisor } from './PainelDoSupervisor';
import { RostoPeloTablet } from './RostoPeloTablet';
import { formatarContagem, segundosRestantes } from './supervisorUi';

type Etapa = 'login' | 'conectar' | 'painel' | 'cadastro' | 'rosto';

/**
 * MODO SUPERVISOR no celular — `/clock?supervisor=1` (07/10/2026, plano do tablet sem toque,
 * entrega E). Fica dentro do app "Ponto" (escopo /clock). O segredo da sessão vive SÓ aqui na
 * memória da página (nada no localStorage) e a página não se recarrega sozinha no meio.
 *
 * O caminho: entrar (código + senha do painel) → mostrar o QR de conectar pro tablet do galpão →
 * lista → "Cadastrar novo" (e já o rosto) ou "Refazer rosto" → QR do rosto → o tablet tira → o
 * supervisor confirma → o tablet bate o ponto da pessoa.
 */
export function SupervisorTabletPage() {
  const [sessao, setSessao] = useState<SessaoDoSupervisor | null>(null);
  const [etapa, setEtapa] = useState<Etapa>('login');
  const [tablet, setTablet] = useState<string | null>(null);
  const [rostoDe, setRostoDe] = useState<{ funcionario: FuncionarioEscolhido; modo: 'novo' | 'refazer' } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [agora, setAgora] = useState(() => Date.now());

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, []);

  const voltarProLogin = useCallback((mensagem: string | null) => {
    setSessao(null);
    setTablet(null);
    setRostoDe(null);
    setEtapa('login');
    setAviso(mensagem);
  }, []);
  const sessaoAcabou = useCallback(() => voltarProLogin('Sua sessão de supervisor acabou. Entre de novo.'), [voltarProLogin]);

  const restam = sessao ? segundosRestantes(sessao.expiresAt, agora) : 0;
  useEffect(() => {
    if (sessao && restam === 0) voltarProLogin('Os 20 minutos da sessão acabaram. Entre de novo.');
  }, [sessao, restam, voltarProLogin]);

  const sair = async () => {
    if (sessao) {
      try {
        await sairDoModoSupervisor(sessao.sessionToken);
      } catch (err) {
        // A sessão vence sozinha em 20 min; sair aqui não pode prender ninguém na tela.
        console.warn('Sair do modo supervisor: o servidor não respondeu — a sessão vence sozinha.', err);
      }
    }
    voltarProLogin(null);
  };

  const conectado = useCallback((nome: string | null) => { setTablet(nome); setEtapa('painel'); }, []);
  const abrirRosto = (funcionario: FuncionarioEscolhido, modo: 'novo' | 'refazer') => { setRostoDe({ funcionario, modo }); setEtapa('rosto'); };

  return (
    <div className="min-h-screen supports-[min-height:100dvh]:min-h-dvh bg-gradient-to-br from-indigo-700 to-blue-800 flex items-start sm:items-center justify-center p-3 sm:p-4" data-testid="modo-supervisor">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">
        <div className="bg-indigo-700 px-5 py-4 text-white">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <ShieldCheck className="w-6 h-6 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="font-bold text-lg leading-tight">Modo supervisor</h1>
                <p className="text-xs text-indigo-100 truncate">
                  {sessao
                    ? `${sessao.funcionario?.nome ?? sessao.usuario.nome ?? `Usuário ${sessao.usuario.id}`} · ${sessao.empresa.nome}${tablet ? ` · ${tablet}` : ''}`
                    : 'Cadastrar funcionário e rosto pelo tablet'}
                </p>
              </div>
            </div>
            {sessao && (
              <button type="button" onClick={() => void sair()} className="flex items-center gap-1 px-3 py-2 bg-white/15 rounded-lg text-sm hover:bg-white/25 flex-shrink-0">
                <LogOut className="w-4 h-4" /> Sair
              </button>
            )}
          </div>
          {sessao && <p className="text-xs text-indigo-100 mt-2" data-testid="sessao-contagem">Sessão: {formatarContagem(restam)}</p>}
        </div>

        <div className="p-5">
          {!sessao || etapa === 'login' ? (
            <EntrarComoSupervisor aviso={aviso} onEntrou={(s) => { setSessao(s); setAviso(null); setEtapa('conectar'); }} />
          ) : etapa === 'conectar' ? (
            <ConectarAoTablet session={sessao.sessionToken} onConectado={conectado} onSessaoAcabou={sessaoAcabou} />
          ) : etapa === 'cadastro' ? (
            <CadastroPeloTablet
              session={sessao.sessionToken}
              podeRefazer={sessao.pode.refazerRosto}
              onCadastrado={(f) => abrirRosto(f, 'novo')}
              onJaExiste={(f) => abrirRosto(f, 'refazer')}
              onVoltar={() => setEtapa('painel')}
              onSessaoAcabou={sessaoAcabou}
            />
          ) : etapa === 'rosto' && rostoDe ? (
            <RostoPeloTablet
              session={sessao.sessionToken}
              funcionario={rostoDe.funcionario}
              modo={rostoDe.modo}
              onFim={() => { setRostoDe(null); setEtapa('painel'); }}
              onSessaoAcabou={sessaoAcabou}
            />
          ) : (
            <PainelDoSupervisor
              session={sessao.sessionToken}
              pode={sessao.pode}
              onCadastrar={() => setEtapa('cadastro')}
              onRefazer={(f: FuncionarioDoSupervisor) => abrirRosto({ employeeId: f.id, nome: f.nome }, 'refazer')}
              onSessaoAcabou={sessaoAcabou}
            />
          )}
        </div>
      </div>
    </div>
  );
}
