import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Clock, CheckCircle, XCircle, ChevronLeft, Loader2, LogOut, Moon, AlertCircle, Building2, Tablet } from 'lucide-react';
import {
  getEmployeeByCpf,
  getEmployeeTodayAttendance,
  getEmployeeAttendanceHistory,
  verifyEmployeePin,
  setEmployeePin,
  getFaceRecognitionConfig,
  getCompaniesByEmployeeCpf,
  getClockDeviceStatus,
  activateClockDevice,
  Employee,
  Attendance,
  Company,
  ClockDevice,
  ProvaDoFuncionario,
} from '../../services/database';
import {
  aparelhoBarradoNaEmpresa,
  esquecerSegredoDoTablet,
  guardarSegredoDoTablet,
  lembrarModoGalpao,
  lerModoGalpaoLembrado,
  lerSegredoDoTablet,
} from './clockDeviceStorage';
import { mensagemDeErro } from '../../utils/mensagemDeErro';
import { useCompany } from '../../contexts/useCompany';
import { getCurrentCompanyId } from '../../contexts/companyHelpers';
import { FaceRegistration } from './FaceRegistration';
import { FaceVerification } from './FaceVerification';
import { RecusaDoServidor, clockErrorMessage, clockFailureMessage } from './clockMessages';
import {
  AUTO_LOGOUT_SECONDS, quickExitMinutes, marcacaoAnteriorDaSaida,
  TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS, TABLET_VOLTA_APOS_FALHA_SEGUNDOS, RECEM_BATIDO_MS, TABLET_TELA_LARGADA_SEGUNDOS,
  MarkingPosition, MARKING_LABELS, getTimestampForPosition, getNextMarkingPosition,
  GALPAO_GPS_POSICAO_ATE_MS, TABLET_BARRADO_RECONFERE_MS, TABLET_RECONFERE_A_CADA_MS,
} from './clockGuards';
import { tocarBipe } from './bipe';
import { FaceIdentifyClock, type RecemBatido } from './FaceIdentifyClock';
import { abertoComoApp, useAppDoPonto } from './useAppDoPonto';
import { PassosNoAppDoPonto } from './CameraProblem';
import { formatHours, formatTime } from './formatoDoPonto';
import { MeusPontos } from './MeusPontos';
import { useAtualizacaoAutomatica } from './useAtualizacaoAutomatica';

// ─── Helpers ─────────────────────────────────────────────────────────────────

// formatTime / formatHours: ./formatoDoPonto (30/09/2026 — os mesmos na tela /erros).

/**
 * Caminho pra consulta (/erros) — erros, pontos e recibos da pessoa, sem bater ponto (30/09/2026,
 * roadmap item 5). Decisão do Victor: aparece só FORA do tablet (no tablet, quem para pra
 * consultar segura a fila de quem vai bater). Quem decide "fora do tablet" é quem renderiza.
 */
const LinkDaConsulta: React.FC<{ destaque?: boolean }> = ({ destaque = false }) => (
  <a
    href="/erros"
    data-testid="link-da-consulta"
    className={destaque
      ? 'block w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[44px] text-center'
      : 'block w-full text-sm text-center text-blue-600 hover:text-blue-800 py-2'}
  >
    Ver meus erros, pontos e recibos
  </a>
);

/* 🔴 O selo de aprovação saiu da tela do funcionário (12/09/2026).
   A aprovação de ponto foi removida do sistema a pedido do Victor, e o
   funcionário via um "🟡 Aguardando aprovação" que não esperava nada: aprovar
   nunca mudou cálculo nenhum, e rejeitar (o único com efeito) nunca foi usado. */

type Step =
  | 'cpf' | 'company-select' | 'pin' | 'setup-pin' | 'face-register' | 'dashboard' | 'error' | 'face-scan'
  // 30/09/2026 — ponto só no tablet da empresa
  | 'device-blocked' | 'device-activate'
  // 30/09/2026 — a tela ainda não sabe por onde começar (ver o efeito do passo inicial)
  | 'carregando';

/** Quanto a tela espera a resposta "quem é este aparelho?" antes de seguir sem ela. */
const PRAZO_CONFERENCIA_DO_TABLET_MS = 5_000;

const TEXTO_DO_PRIMEIRO_ACESSO =
  'Este é seu primeiro acesso. Defina uma senha numérica de 4 a 6 dígitos para registrar seu ponto.';

/**
 * Situação DESTE aparelho (30/09/2026): 'pendente' = ainda perguntando ao servidor;
 * 'conferido' = sabe-se se é tablet (device) ou não (null); 'falhou' = a consulta deu erro de
 * rede — aí a tela NÃO barra ninguém por conta própria (quem decide é o servidor na batida),
 * pra um soluço de internet na hora de abrir a página não trancar o tablet de verdade.
 */
type ConferenciaDoAparelho = 'pendente' | 'conferido' | 'falhou';

/**
 * GPS PEDIDO MAIS CEDO (30/09/2026). Meta do Victor: da pessoa parar na frente do tablet até o
 * ponto gravado, 5 a 7 segundos. Medido no banco (14 dias): do rosto reconhecido ao ponto
 * gravado a mediana era 7,1s (pior 13s) — 3s eram a contagem com o nome na tela (decisão de
 * 04/09; 2s desde 30/09) e boa parte do resto era o GPS: a posição só era pedida DEPOIS da contagem/da facial, e
 * a batida esperava o aparelho achar o satélite (16 batidas em 14 dias morreram em "Localização
 * não fornecida").
 *
 * Agora o pedido sai no instante em que a pessoa é reconhecida (ou aperta "Registrar") e corre
 * JUNTO com a contagem e a verificação facial; a batida usa esse pedido se ele saiu há no
 * máximo GPS_ANTECIPADO_VALIDO_MS. A posição continua NOVA (maximumAge 0, obtida depois do
 * pedido) — só deixou de esperar na fila.
 *
 * ⚠️ Descartado no caminho: "acompanhar" a posição com watchPosition. Medido no Chromium: com o
 * acompanhamento ativo, o pedido de posição nova da batida ESTOURA os 10s — e o teste de cliques
 * reais pegou isso ("Localização não fornecida" com o GPS ligado).
 */
const GPS_ANTECIPADO_VALIDO_MS = 20_000;

/** Solicita geolocalização. Resolve com a position, ou rejeita com o código do erro.
 *  `maximumAge` 0 (padrão) = posição NOVA; o tablet fixo do galpão aceita uma recente. */
function requestGeolocation(maximumAge = 0): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject({ code: 2 }); // POSITION_UNAVAILABLE
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge,
    });
  });
}

/**
 * GPS do tablet FIXO no modo galpão (06/10/2026, decisão 8 do plano do tablet sem toque): aceita uma
 * posição de até GALPAO_GPS_POSICAO_ATE_MS (o tablet não sai do lugar) e, se o GPS falhar, tenta de
 * novo sozinho UMA vez — no galpão a 1ª leitura às vezes falha, e a 1ª batida do dia sem posição é
 * recusada ("Localização não fornecida"). Permissão NEGADA não tenta de novo: não adianta (a tela da
 * câmera avisa o responsável).
 */
async function requestGeolocationDoTabletFixo(): Promise<GeolocationPosition> {
  try {
    return await requestGeolocation(GALPAO_GPS_POSICAO_ATE_MS);
  } catch (err) {
    const negada = typeof err === 'object' && err !== null && 'code' in err && err.code === 1;
    if (negada) throw err;
    return await requestGeolocation(GALPAO_GPS_POSICAO_ATE_MS);
  }
}

function formatCPFMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

/** Permissão de localização BLOQUEADA no navegador? (bloqueada ≠ nunca pedida:
 *  quando nunca foi pedida, o próprio navegador pergunta na hora da batida.) */
async function isGeoPermissionDenied(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false; // navegador antigo: segue o fluxo normal
    const status = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

/**
 * Permissão de câmera BLOQUEADA no navegador? (04/09/2026, pedido do Victor —
 * mesmo padrão do GPS acima.) Safari/iOS não suporta `permissions.query('camera')`
 * — cai no catch e segue o fluxo normal; nesse caso quem pega o bloqueio é o
 * `NotAllowedError` do próprio `getUserMedia`, dentro de FaceVerification/
 * FaceIdentifyClock (mostra a mesma instrução, na hora que a câmera abre).
 */
async function isCameraPermissionDenied(): Promise<boolean> {
  try {
    if (!navigator.permissions?.query) return false;
    const status = await navigator.permissions.query({ name: 'camera' as PermissionName });
    return status.state === 'denied';
  } catch {
    return false;
  }
}

/** Como liberar a Localização no navegador comum (aviso do painel e, no modo galpão, da câmera). */
const PassosDaLocalizacaoNoNavegador: React.FC = () => (
  <>
    <ol className="text-gray-700 text-sm space-y-2 list-decimal list-inside bg-gray-50 rounded-xl p-3">
      <li>Toque no <strong>cadeado</strong> (ou ⓘ) ao lado do endereço do site</li>
      <li>Toque em <strong>Permissões</strong></li>
      <li>Em <strong>Localização</strong>, escolha <strong>Permitir</strong></li>
    </ol>
    <p className="text-gray-500 text-xs">
      Se não aparecer, vá nas Configurações do celular → Aplicativos → seu navegador → Permissões → Localização → Permitir.
    </p>
  </>
);

// ─── Component ────────────────────────────────────────────────────────────────

export const EmployeeClockIn: React.FC = () => {
  // Aplicativo "Ponto" no tablet (30/09/2026): instalável, sem zoom, letras maiores e tela acesa.
  useAppDoPonto();
  const { company, setCompany, loading: companyLoading } = useCompany();
  /**
   * 🔴 30/09/2026 — A TELA NASCE EM "carregando", NÃO EM "cpf".
   * Antes ela nascia no CPF e, quando a empresa carregava, TROCAVA pra câmera (empresa com
   * facial primeiro) — se a pessoa já estivesse digitando o CPF, a tela mudava debaixo dela.
   * A espera pela conferência do tablet alongou essa janela e o teste de cliques reais pegou
   * exatamente isso. Agora a tela só mostra CPF ou câmera quando JÁ SABE qual dos dois.
   */
  const [step, setStep] = useState<Step>('carregando');
  // Ponto sem CPF (04/09/2026): quando a empresa tem reconhecimento facial
  // ligado, a tela abre direto na câmera em vez de pedir CPF — o CPF vira só
  // uma alternativa manual (botão "Prefere digitar CPF e senha?"). Resolvido
  // uma vez, quando a empresa fica disponível; nunca sobrescreve depois disso
  // (senão brigaria com o usuário navegando pra "digitar CPF" de propósito).
  const [defaultStep, setDefaultStep] = useState<Step>('cpf');
  const defaultStepResolvedRef = useRef(false);
  // Guarda a marcação decidida pelo reconhecimento sem CPF até `employee`
  // (state) realmente virar essa pessoa — evita o closure velho de
  // executeClock/callClockValidated (que leem `employee` do escopo do
  // componente, não de parâmetro) rodar com o funcionário antigo.
  const pendingFaceIdentifyRef = useRef<{ type: 'entry' | 'exit'; markingPosition?: MarkingPosition; descriptor: number[] } | null>(null);
  const [cpfInput, setCpfInput] = useState('');
  const [pin, setPin] = useState('');
  const [setupField, setSetupField] = useState<'new' | 'confirm'>('new');
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  /**
   * O PIN desta sessão (30/09/2026): o que a pessoa digitou pra entrar, ou o que acabou de criar
   * no 1º acesso. O servidor exige ele pra gravar/ler o rosto e pra cadastrar rosto pela batida —
   * sem isso, quem soubesse o CPF de um colega trocava o rosto dele. Some no "sair" (handleLogout
   * zera os dois). Na facial sem CPF não existe PIN — e ela nem usa essas ações.
   */
  const pinDaSessao = pin || newPin;
  /** Comprovante do rosto reconhecido na facial sem CPF (30/09/2026) — lá não existe PIN. */
  const [comprovanteFacial, setComprovanteFacial] = useState<string | undefined>(undefined);
  /**
   * Como esta sessão prova pro servidor que é a própria pessoa (30/09/2026, roadmap item 5): ponto
   * do dia e histórico só saem com o PIN dela ou com o comprovante do rosto. Sem nenhum dos dois
   * (não deveria acontecer) vai vazio, e o servidor decide.
   */
  const provaDaSessao = useMemo<ProvaDoFuncionario>(
    () => (pinDaSessao ? { pin: pinDaSessao } : comprovanteFacial ? { comprovanteFacial } : {}),
    [pinDaSessao, comprovanteFacial],
  );
  const [setupError, setSetupError] = useState('');
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [availableCompanies, setAvailableCompanies] = useState<Company[]>([]);
  const [todayRecord, setTodayRecord] = useState<Attendance | null>(null);
  const [history, setHistory] = useState<Attendance[]>([]);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);
  const [clockLoading, setClockLoading] = useState(false);
  const [clockMsg, setClockMsg] = useState<string | null>(null);

  // Facial: se ativo, verifica rosto ao clicar em Registrar Entrada/Saída
  const [faceGateActive, setFaceGateActive] = useState(false);
  const [pendingClockType, setPendingClockType] = useState<'entry' | 'exit' | null>(null);

  // Trava de saída rápida (< QUICK_EXIT_CONFIRM_MINUTES da marcação anterior)
  const [confirmExit, setConfirmExit] = useState<{ markingPosition?: MarkingPosition; minutesAgo: number } | null>(null);
  // Overlay de instrução quando a permissão de localização está bloqueada
  const [geoBlocked, setGeoBlocked] = useState(false);
  // Overlay de instrução quando a permissão de câmera está bloqueada (04/09/2026)
  const [cameraBlocked, setCameraBlocked] = useState(false);
  // Volta pro início (CPF) sozinho após registrar ponto (aparelho compartilhado)
  const autoLogoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ─── Ponto só no tablet da empresa (30/09/2026) ────────────────────────────
  // O segredo do tablet vive só neste aparelho; o servidor confere em toda batida.
  const [deviceToken, setDeviceToken] = useState<string | null>(() => lerSegredoDoTablet());
  const [device, setDevice] = useState<ClockDevice | null>(null);
  const [deviceCheck, setDeviceCheck] = useState<ConferenciaDoAparelho>(() => (lerSegredoDoTablet() ? 'pendente' : 'conferido'));
  /**
   * MODO GALPÃO — o tablet SEM TOQUE (06/10/2026, plano do tablet sem toque; o 2626 liga por tablet).
   * Quem manda é a resposta do servidor (`device`); sem ela (conferência pendente/que falhou, ou
   * tablet removido) vale o último que o servidor disse — ver lerModoGalpaoLembrado.
   */
  const [modoGalpaoLembrado, setModoGalpaoLembrado] = useState<boolean>(() => lerModoGalpaoLembrado());
  const modoGalpao = device ? device.modoGalpao === true : modoGalpaoLembrado;
  useEffect(() => {
    if (!device) return;
    const ligado = device.modoGalpao === true;
    lembrarModoGalpao(ligado);
    setModoGalpaoLembrado(ligado);
  }, [device]);
  /** Modo galpão: a batida em andamento veio do rosto (a tela mostra o resultado GRANDE, sem botão). */
  const [batidaPeloRosto, setBatidaPeloRosto] = useState(false);

  /**
   * Versão nova publicada → a tela se recarrega sozinha (01/10/2026, ver useAtualizacaoAutomatica),
   * mas só com a tela LIVRE: na tela inicial sem CPF digitado, ou na câmera sem ninguém sendo
   * reconhecido. Nunca no meio do PIN, do cadastro do rosto ou com o painel aberto.
   */
  const [cameraOcupada, setCameraOcupada] = useState(false);
  const telaLivre = cpfInput === ''
    && (step === 'cpf' || step === 'device-blocked' || (step === 'face-scan' && !cameraOcupada));
  useAtualizacaoAutomatica({ podeRecarregar: telaLivre });
  const [empresaBarrada, setEmpresaBarrada] = useState<string | null>(null);
  const [activationCode, setActivationCode] = useState('');
  const [activationError, setActivationError] = useState('');
  const [activating, setActivating] = useState(false);
  const [activated, setActivated] = useState<ClockDevice | null>(null);

  /**
   * Aparelho compartilhado (tablet) — 05/10/2026: tem o segredo do tablet guardado. Vale também com
   * a conferência no servidor pendente ou que FALHOU (rede): um soluço de rede ao abrir não pode fazer
   * o tablet agir como celular (volta em 35s, sem volta no erro, troca de empresa gravada, link da
   * consulta à mostra). Segredo que o servidor recusa é apagado na conferência (aí vira celular).
   */
  const ehTablet = !!device || !!deviceToken;

  /**
   * Tablet que atende 2 empresas (Caratinga e Ponte Nova no mesmo galpão): quem entra pelo CPF troca
   * a empresa da TELA só pra sessão dele — no tablet a troca NÃO é gravada no aparelho. A empresa "de
   * casa" do tablet é sempre a gravada: recarga no meio da sessão, rede caindo na hora da volta ou o
   * próximo CPF não mudam a casa. Ao voltar pro início a tela volta pra ela (senão a câmera passaria a
   * procurar só o pessoal da outra empresa). No celular a escolha é gravada, como sempre.
   */
  const trocarEmpresaDaTela = (empresaId: string) => setCompany(empresaId, { persistir: !ehTablet });
  /** Pede SEMPRE (mesmo já parecendo estar em casa): uma troca pelo CPF ainda a caminho perde pro
   *  pedido mais novo (setCompany: o último pedido ganha) — sem isto, ela chegava depois e deixava a
   *  tela inicial na outra empresa. */
  const voltarPraEmpresaDoTablet = () => {
    if (!ehTablet) return;
    setCompany(getCurrentCompanyId(), { persistir: false }).catch((err: unknown) => {
      // A casa continua gravada: a próxima volta tenta de novo.
      console.error('Tablet: não consegui voltar a tela pra empresa dele:', err);
    });
  };
  /** No tablet a tela volta mais rápido (fila) — ver TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS. */
  const segundosParaVoltar = (deuErro: boolean): number | null =>
    ehTablet ? (deuErro ? TABLET_VOLTA_APOS_FALHA_SEGUNDOS : TABLET_VOLTA_APOS_SUCESSO_SEGUNDOS)
      : (deuErro ? null : AUTO_LOGOUT_SECONDS);
  const voltarSozinhoEm = (segundos: number) => {
    if (autoLogoutRef.current) clearTimeout(autoLogoutRef.current);
    autoLogoutRef.current = setTimeout(() => {
      autoLogoutRef.current = null;
      handleLogout();
    }, segundos * 1000);
  };
  /** Falha no tablet: a tela volta sozinha (antes ficava parada no painel da pessoa, sem prazo). */
  const avisarFalha = (mensagem: string) => {
    const segundos = segundosParaVoltar(true);
    if (segundos == null) { setClockMsg(mensagem); return; }
    setClockMsg(`${mensagem} · a tela volta ao início em ${segundos}s`);
    voltarSozinhoEm(segundos);
  };
  /** Fechou um aviso SEM bater ("Não! Foi engano", "Já liberei"): no tablet a tela volta sozinha. */
  const rearmarVoltaNoTablet = () => {
    if (ehTablet) voltarSozinhoEm(TABLET_VOLTA_APOS_FALHA_SEGUNDOS);
  };
  /**
   * Dono da batida em andamento (05/10/2026): sobe a cada batida nova e a cada "voltar ao início".
   * Uma batida que perdeu a vez — a pessoa tocou "Sair" no meio, ou tentou de novo depois do
   * "Tempo esgotado" — ao responder não escreve no painel, não agenda a volta da tela e não mexe no
   * "Registrando..." nem na trava de duplo clique, que já são da sessão/batida nova.
   */
  const batidaDaVezRef = useRef(0);
  /**
   * Quem acabou de bater (05/10/2026): com a tela voltando em 8s, quem bateu e continua na frente do
   * tablet era reconhecido de novo e caía na pergunta de saída (travando a fila). A câmera ignora
   * essas pessoas por RECEM_BATIDO_MS — e nem consulta o servidor quando o rosto bate no próprio tablet.
   */
  const recemBatidosRef = useRef<RecemBatido[]>([]);

  // GPS pedido mais cedo (30/09/2026 — ver GPS_ANTECIPADO_VALIDO_MS).
  const posicaoAntecipadaRef = useRef<{ promessa: Promise<GeolocationPosition>; pedidaEm: number } | null>(null);
  // Modo galpão lido na hora (o pedido antecipado é um callback estável).
  const modoGalpaoRef = useRef(modoGalpao);
  useEffect(() => { modoGalpaoRef.current = modoGalpao; });
  /** Dispara agora o pedido de posição da batida que vem nos próximos segundos. */
  const anteciparPosicao = useCallback(() => {
    const atual = posicaoAntecipadaRef.current;
    if (atual && Date.now() - atual.pedidaEm <= GPS_ANTECIPADO_VALIDO_MS) return; // já tem pedido recente
    const promessa = modoGalpaoRef.current ? requestGeolocationDoTabletFixo() : requestGeolocation();
    // Quem decide o que fazer com a falha é a batida (vira "sem localização", como sempre foi);
    // aqui só fica registrado, pra rejeição não ficar solta.
    promessa.catch((err: unknown) => {
      console.warn('GPS pedido mais cedo falhou (a batida segue sem localização, como antes):', err);
    });
    posicaoAntecipadaRef.current = { promessa, pedidaEm: Date.now() };
  }, []);

  // Guards anti-duplo-clique e watchdog do botão de ponto
  const inFlightClockRef = useRef(false);
  const clockWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingMarkingPositionRef = useRef<MarkingPosition | null>(null);

  // ─── Load dashboard data ──────────────────────────────────────────────────

  const loadDashboard = useCallback(async (emp: Employee, silent = false) => {
    if (!company?.id) return;
    if (!silent) setLoading(true);
    // Reset mensagem residual: evita que um erro antigo persista
    // quando o polling (30s) ou um reload posterior confirma o registro.
    setClockMsg(null);
    try {
      const [today, hist] = await Promise.all([
        getEmployeeTodayAttendance(emp.id, company.id, provaDaSessao),
        getEmployeeAttendanceHistory(emp.id, 30, company.id, provaDaSessao),
      ]);
      // Merge inteligente: só atualiza o state se houve mudança real
      setTodayRecord(prev => JSON.stringify(prev) === JSON.stringify(today) ? prev : today);
      setHistory(prev => JSON.stringify(prev) === JSON.stringify(hist) ? prev : hist);
    } catch {
      if (!silent) {
        setErrorMsg('Erro ao carregar dados. Tente novamente.');
        setStep('error');
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [company?.id, provaDaSessao]);

  // Atualiza dashboard a cada 30s enquanto está na tela (silencioso — sem flash)
  useEffect(() => {
    if (step !== 'dashboard' || !employee) return;
    // Com uma volta da tela pendente (mensagem de ✅/⚠️/❌ na tela) não recarrega: o recarregamento
    // apaga a mensagem antes de a pessoa ler (05/10/2026).
    const interval = setInterval(() => { if (!autoLogoutRef.current) void loadDashboard(employee, true); }, 30000);
    return () => clearInterval(interval);
  }, [step, employee, loadDashboard]);

  // Limpa watchdog e auto-logout ao desmontar
  useEffect(() => () => {
    if (clockWatchdogRef.current) clearTimeout(clockWatchdogRef.current);
    if (autoLogoutRef.current) clearTimeout(autoLogoutRef.current);
  }, []);

  // Resolve o modo padrão da tela (câmera aberta × CPF) uma única vez, assim
  // que a empresa fica disponível — nunca de novo depois (ver comentário no
  // state). Lê `company.face_identify_default` direto (já veio junto com a
  // empresa, sem chamada extra) — de propósito: uma 2ª chamada de rede aqui
  // criaria uma corrida real contra a pessoa já digitando o CPF na tela.
  //
  // 30/09/2026: espera também a conferência do aparelho — com a trava da empresa ligada e este
  // aparelho não sendo um tablet dela, a tela já abre dizendo isso (em vez de abrir a câmera
  // ou pedir CPF e senha pra recusar no fim).
  useEffect(() => {
    if (defaultStepResolvedRef.current || deviceCheck === 'pendente') return;
    // Empresa ainda carregando: espera. Se falhou de vez (sem empresa nenhuma), segue no CPF —
    // o CPF resolve a empresa sozinho, como sempre.
    if (!company?.id && companyLoading) return;
    defaultStepResolvedRef.current = true;
    // Modo galpão (06/10/2026): o tablet SEMPRE abre na câmera — ninguém vai tocar pra chegar nela.
    const resolved: Step = company?.face_identify_default === true || modoGalpao ? 'face-scan' : 'cpf';
    setDefaultStep(resolved);
    const barrado = deviceCheck === 'conferido' && aparelhoBarradoNaEmpresa(company, device);
    if (barrado) setEmpresaBarrada(company?.display_name ?? null);
    setStep((prev) => (prev === 'carregando' ? (barrado ? 'device-blocked' : resolved) : prev));
  }, [company, companyLoading, deviceCheck, device, modoGalpao]);

  // Modo galpão ligado com a tela já aberta (a conferência que falhou ao abrir deu certo depois, ou o
  // 2626 ligou agora): a tela passa a começar na câmera — e vai pra ela já, se estiver parada no CPF
  // vazio. Desligar não troca nada no meio: vale na próxima abertura da tela.
  useEffect(() => {
    if (!modoGalpao || !defaultStepResolvedRef.current || defaultStep === 'face-scan') return;
    setDefaultStep('face-scan');
    setStep((prev) => (prev === 'cpf' && cpfInput === '' ? 'face-scan' : prev));
  }, [modoGalpao, defaultStep, cpfInput]);

  // Quem é este aparelho? (só pergunta quando há um segredo guardado)
  // Com PRAZO: resposta que não chega não pode prender a tela em "carregando" — passa a valer
  // 'falhou' (a tela segue sem barrar ninguém e o servidor confere na batida).
  useEffect(() => {
    if (!deviceToken || deviceCheck !== 'pendente') return;
    let cancelado = false;
    let prazoTimer: ReturnType<typeof setTimeout> | null = null;
    const prazo = new Promise<never>((_, rejeitar) => {
      prazoTimer = setTimeout(() => rejeitar(new Error('sem resposta do servidor no prazo')), PRAZO_CONFERENCIA_DO_TABLET_MS);
    });
    Promise.race([getClockDeviceStatus(deviceToken), prazo])
      .then((tablet) => {
        if (cancelado) return;
        // Removido no painel (ou segredo que não vale mais): o segredo guardado não serve.
        if (!tablet) {
          esquecerSegredoDoTablet();
          setDeviceToken(null);
        }
        setDevice(tablet);
        setDeviceCheck('conferido');
      })
      .catch((err: unknown) => {
        if (cancelado) return;
        console.error('Não foi possível conferir o tablet agora — o servidor confere na batida:', err);
        setDeviceCheck('falhou');
      })
      .finally(() => { if (prazoTimer) clearTimeout(prazoTimer); });
    return () => {
      cancelado = true;
      if (prazoTimer) clearTimeout(prazoTimer);
    };
  }, [deviceToken, deviceCheck]);

  /** A tela deve barrar este aparelho na empresa? (só com a conferência feita — ver o tipo) */
  const barradoNaEmpresa = (empresa: Company | null | undefined): boolean =>
    deviceCheck === 'conferido' && aparelhoBarradoNaEmpresa(empresa, device);

  const mostrarAparelhoBarrado = (nomeDaEmpresa: string | null) => {
    setEmpresaBarrada(nomeDaEmpresa);
    setStep('device-blocked');
  };

  // Voltou pro passo inicial por QUALQUER caminho (ex.: alguém da outra empresa desistiu na tela da
  // senha e tocou "Voltar pro reconhecimento facial"; no tablet que abre no CPF, o "Tentar novamente"
  // do erro): a tela volta pra empresa do tablet. Sem isto, só o fim da sessão (handleLogout)
  // devolvia a empresa. Só a TROCA de tela dispara — a empresa mudando pelo CPF na própria tela
  // inicial não pode disparar a volta (desfaria a troca no meio).
  useEffect(() => {
    if (step === defaultStep) voltarPraEmpresaDoTablet();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a troca de tela importa
  }, [step]);

  // Conferência do tablet que falhou (rede): tenta de novo quando a rede volta ou a tela volta a
  // aparecer (05/10/2026). Antes, falhou uma vez ao abrir, falhava o dia todo.
  useEffect(() => {
    if (deviceCheck !== 'falhou' || !deviceToken) return;
    const tentarDeNovo = () => { if (document.visibilityState === 'visible') setDeviceCheck('pendente'); };
    window.addEventListener('online', tentarDeNovo);
    document.addEventListener('visibilitychange', tentarDeNovo);
    return () => {
      window.removeEventListener('online', tentarDeNovo);
      document.removeEventListener('visibilitychange', tentarDeNovo);
    };
  }, [deviceCheck, deviceToken]);

  // Tablet: reconfere quem é a cada TABLET_RECONFERE_A_CADA_MS, SÓ com a tela livre (06/10/2026). É
  // assim que um tablet que ninguém toca fica sabendo que o 2626 ligou/desligou o modo galpão — antes,
  // só recarregando a página. Só atualiza o que a tela sabe: quem decide a batida é o servidor.
  const telaLivreRef = useRef(telaLivre);
  useEffect(() => { telaLivreRef.current = telaLivre; });
  useEffect(() => {
    if (!deviceToken || deviceCheck === 'pendente') return;
    const ritmo = setInterval(() => {
      if (telaLivreRef.current) setDeviceCheck('pendente');
    }, TABLET_RECONFERE_A_CADA_MS);
    return () => clearInterval(ritmo);
  }, [deviceToken, deviceCheck]);

  // Tablet BARRADO pelo servidor (removido no painel, ou a empresa saiu dele): reconfere sozinho a
  // cada TABLET_BARRADO_RECONFERE_MS (06/10/2026 — antes a tela ficava parada até alguém tocar).
  useEffect(() => {
    if (step !== 'device-blocked' || !deviceToken) return;
    const ritmo = setInterval(() => {
      setDeviceCheck((atual) => (atual === 'pendente' ? atual : 'pendente'));
    }, TABLET_BARRADO_RECONFERE_MS);
    return () => clearInterval(ritmo);
  }, [step, deviceToken]);

  // Dispara o registro assim que `employee` (state) realmente virar a pessoa
  // identificada pela câmera sem CPF (ver comentário no ref, acima).
  useEffect(() => {
    const pending = pendingFaceIdentifyRef.current;
    if (!pending || !employee) return;
    pendingFaceIdentifyRef.current = null;
    executeClock(pending.type, pending.markingPosition, pending.descriptor);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employee]);

  // ─── Face recognition gate ────────────────────────────────────────────────
  // Decide o próximo passo após autenticação por PIN:
  // - Primeiro acesso (ou admin pediu reset) com facial ativo → face-register
  // - Caso contrário → dashboard direto; a verificação facial acontece no
  //   momento de bater o ponto (gate controlado por faceGateActive).
  const continueAfterPin = useCallback(async (emp: Employee) => {
    if (!company?.id) return;
    try {
      const cfg = await getFaceRecognitionConfig(company.id);
      const empEnabled = emp.face_recognition_enabled !== false; // null/undefined = habilitado por padrão
      // Trava dura por empresa (31/08): quando ligada, a facial é OBRIGATÓRIA — ignora o
      // toggle por funcionário e o config global; quem não tem rosto cai no cadastro (abaixo).
      const strict = company.require_facial_clock === true;
      const activeGlobally = strict || (cfg.enabled && empEnabled);

      if (activeGlobally && (!emp.face_registered || emp.face_reset_requested)) {
        setFaceGateActive(true); // após cadastrar, próximos pontos vão exigir verificação
        setStep('face-register');
        return;
      }

      setFaceGateActive(activeGlobally && !!emp.face_registered && !emp.face_reset_requested);
      await loadDashboard(emp);
      setClockMsg(null); // entrada fresca no dashboard: zera qualquer msg residual
      setStep('dashboard');
    } catch (err) {
      console.error('Erro no gate facial, seguindo sem facial:', err);
      setFaceGateActive(false);
      await loadDashboard(emp);
      setClockMsg(null);
      setStep('dashboard');
    }
  }, [loadDashboard, company?.id, company?.require_facial_clock]);

  // ─── CPF ────────────────────────────────────────────────────────────────────

  // Pós-validação de funcionário: decide próximo step (setup-pin ou pin).
  // Sub-fase 26/08 — cadastro recusado na análise de antecedentes: bloqueia
  // no próximo ponto (pending/approved seguem batendo ponto normal).
  const proceedAfterEmployee = (emp: Employee) => {
    if (emp.registration_status === 'rejected') {
      setErrorMsg('Seu cadastro foi recusado. Procure seu supervisor ou o RH para mais informações.');
      setStep('error');
      return;
    }
    setEmployee(emp);
    if (!emp.pin_configured) {
      setSetupField('new');
      setNewPin('');
      setConfirmPin('');
      setSetupError('');
      setStep('setup-pin');
    } else {
      setStep('pin');
    }
  };

  const handleCpfSubmit = async () => {
    setLoading(true);
    try {
      const companies = await getCompaniesByEmployeeCpf(cpfInput);
      if (companies.length === 0) {
        setErrorMsg('Funcionário não encontrado. Verifique o CPF digitado.');
        setStep('error');
        return;
      }
      if (companies.length === 1) {
        await trocarEmpresaDaTela(companies[0].id);
        // Trava do tablet: avisa ANTES da senha (o servidor recusaria a batida no fim).
        if (barradoNaEmpresa(companies[0])) {
          mostrarAparelhoBarrado(companies[0].display_name);
          return;
        }
        const emp = await getEmployeeByCpf(cpfInput, companies[0].id);
        if (!emp) {
          setErrorMsg('Funcionário não encontrado. Verifique o CPF digitado.');
          setStep('error');
          return;
        }
        proceedAfterEmployee(emp);
        return;
      }
      // 2+ empresas: usuário escolhe.
      setAvailableCompanies(companies);
      setStep('company-select');
    } catch {
      setErrorMsg('Erro ao buscar funcionário. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handleCompanyPick = async (company: Company) => {
    setLoading(true);
    try {
      await trocarEmpresaDaTela(company.id);
      if (barradoNaEmpresa(company)) {
        mostrarAparelhoBarrado(company.display_name);
        return;
      }
      const emp = await getEmployeeByCpf(cpfInput, company.id);
      if (!emp) {
        setErrorMsg('Funcionário não encontrado nesta empresa.');
        setStep('error');
        return;
      }
      proceedAfterEmployee(emp);
    } catch {
      setErrorMsg('Erro ao buscar funcionário. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // ─── PIN keypad ───────────────────────────────────────────────────────────

  const KEYPAD = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', '⌫'];

  const handlePinSubmit = async () => {
    if (!employee) return;
    setLoading(true);
    try {
      const valid = await verifyEmployeePin(employee.id, pin);
      if (!valid) {
        setPin('');
        setErrorMsg('PIN incorreto. Tente novamente.');
        setStep('error');
        return;
      }
      await continueAfterPin(employee);
    } catch {
      setErrorMsg('Erro ao verificar PIN. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  // ─── Setup PIN (first login) ──────────────────────────────────────────────

  const handleSavePin = async () => {
    if (!employee) return;
    if (newPin !== confirmPin) {
      setSetupError('As senhas não conferem');
      setConfirmPin('');
      setSetupField('confirm');
      return;
    }
    setLoading(true);
    setSetupError('');
    try {
      await setEmployeePin(employee.id, newPin);
      await continueAfterPin(employee);
    } catch (err) {
      setSetupError(err instanceof Error ? err.message : 'Erro ao salvar PIN');
    } finally {
      setLoading(false);
    }
  };

  // ─── Clock in / out (server-side validation via Edge Function) ─────────

  const EDGE_FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/clock-in-validated`;

  const callClockValidated = async (
    clockType: 'entry' | 'exit',
    signal?: AbortSignal,
    markingPosition?: MarkingPosition,
    faceDescriptor?: number[] | null,
  ): Promise<{ success: boolean; fraud: boolean; geo_warning?: boolean; distance_meters: number | null; attendance?: Attendance; error?: string; message?: string; face_error?: boolean; device_error?: boolean }> => {
    if (!employee) throw new Error('Funcionário não carregado');

    let latitude: number | null = null;
    let longitude: number | null = null;
    let accuracy: number | null = null;

    try {
      // Pedido feito mais cedo (há no máximo GPS_ANTECIPADO_VALIDO_MS) serve a ESTA batida;
      // sem ele, pede na hora (como antes). Cada pedido serve a uma batida só.
      const antecipada = posicaoAntecipadaRef.current;
      posicaoAntecipadaRef.current = null;
      const position = antecipada && Date.now() - antecipada.pedidaEm <= GPS_ANTECIPADO_VALIDO_MS
        ? await antecipada.promessa
        : await (modoGalpao ? requestGeolocationDoTabletFixo() : requestGeolocation());
      latitude = position.coords.latitude;
      longitude = position.coords.longitude;
      accuracy = position.coords.accuracy;
    } catch {
      // GPS denied/unavailable/timeout → send null coords, server handles silently
    }

    // Sub-fase 11.4 — clock-in-validated v7 tem verify_jwt:true.
    // ANON_KEY é um JWT válido (assinado pelo Supabase). Cliente público
    // do funcionário não faz login admin/supervisor — usa CPF+PIN local.
    // ANON_KEY como Bearer satisfaz verify_jwt sem expor sessão privilegiada.
    const res = await fetch(EDGE_FN_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({
        employee_id: employee.id,
        cpf: employee.cpf,
        company_id: employee.company_id,
        clock_type: clockType,
        latitude,
        longitude,
        accuracy,
        ...(markingPosition ? { marking_position: markingPosition } : {}),
        // Rosto do momento (128 nºs) — o servidor reconfere na trava dura por empresa.
        // Só vai quando a facial rodou antes da batida; no modo legado fica de fora.
        ...(faceDescriptor && faceDescriptor.length ? { face_descriptor_now: faceDescriptor } : {}),
        // Segredo do tablet (30/09/2026) — com a trava da empresa ligada, sem ele não bate.
        ...(deviceToken ? { device_token: deviceToken } : {}),
        // PIN que a pessoa digitou (30/09/2026): o servidor só cadastra rosto pela batida com ele.
        ...(pinDaSessao ? { pin: pinDaSessao } : {}),
      }),
      signal,
    });

    const data = await res.json();
    // 06/10/2026: a recusa leva o MOTIVO do servidor até a tela (ver RecusaDoServidor).
    if (!res.ok) throw new RecusaDoServidor(data.error || 'Erro no servidor', res.status);
    return data;
  };

  // Executa a batida de ponto de fato (chamada à Edge Function + feedback).
  // Em caso de timeout (30s), consulta o banco para ver se o servidor
  // registrou mesmo assim antes de mostrar erro ao usuário.
  const executeClock = async (type: 'entry' | 'exit', markingPosition?: MarkingPosition, faceDescriptor?: number[] | null) => {
    if (!employee) return;
    // Guard síncrono: bloqueia qualquer segundo clique enquanto um registro
    // estiver em voo (ou no debounce de 3s pós-clique). React schedula o
    // setClockLoading, mas o ref é atualizado imediatamente.
    if (inFlightClockRef.current) return;
    inFlightClockRef.current = true;
    // Esta batida é a da vez (ver batidaDaVezRef)? Perdeu a vez, a resposta não mexe mais na tela.
    const minhaVez = ++batidaDaVezRef.current;
    const daVez = () => batidaDaVezRef.current === minhaVez;

    setClockLoading(true);
    setClockMsg(null);

    // AbortController para cortar o fetch em 30s (antes era 15s).
    const controller = new AbortController();
    const abortTimer = setTimeout(() => controller.abort(), 30_000);

    // Watchdog extra (35s): segurança se o try/catch não chegar a rodar. No tablet, a tela volta
    // sozinha também neste caso (05/10/2026 — antes ficava parada com o "Tempo esgotado").
    if (clockWatchdogRef.current) clearTimeout(clockWatchdogRef.current);
    // (O vigia é sempre da batida da vez: a batida nova e o "Sair" desligam o anterior.)
    clockWatchdogRef.current = setTimeout(() => {
      setClockLoading(false);
      inFlightClockRef.current = false;
      clockWatchdogRef.current = null;
      avisarFalha('❌ Tempo esgotado. Verifique sua conexão e tente novamente.');
    }, 35_000);

    const now = () => new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    /** O ponto desta batida já está no banco? Devolve o registro do dia (ou null) — o servidor pode
     *  ter gravado mesmo respondendo erro ou estourando o tempo. */
    const conferirNoBanco = async (): Promise<Attendance | null> => {
      if (!company?.id) return null;
      try {
        const today = await getEmployeeTodayAttendance(employee.id, company.id, provaDaSessao);
        const gravado = markingPosition
          ? !!getTimestampForPosition(today, markingPosition)
          : (type === 'entry' ? !!today?.entry_time : !!today?.exit_time_full);
        return gravado ? today : null;
      } catch {
        return null;
      }
    };
    /** 1ª entrada gravada FORA da área: pela resposta (`fraud`) ou — quando a resposta se perdeu —
     *  pelo próprio registro do dia (geo_valid = false). */
    const foraDaAreaDe = (
      gravado: Attendance | null | undefined,
      resposta?: { fraud?: boolean; distance_meters?: number | null },
    ): { distancia: number | null } | undefined => {
      if (resposta?.fraud && resposta.distance_meters != null) return { distancia: resposta.distance_meters };
      const primeiraEntrada = type === 'entry' && (!markingPosition || markingPosition === 1);
      if (primeiraEntrada && gravado?.geo_valid === false) return { distancia: gravado.geo_distance_meters ?? null };
      return undefined;
    };

    /**
     * `foraDaArea` (05/10/2026): o servidor GRAVA a 1ª entrada do dia mesmo fora da cerca (e marca
     * fraude + bloqueio de bônus) e responde success=false — a tela conferia no banco, achava a
     * entrada e mostrava "✅ registrada". A pessoa nunca ficava sabendo (uma bateu 12 noites seguidas
     * assim). Agora o aviso diz que foi gravada FORA da área e pede pra avisar o supervisor.
     */
    const setSuccessMsg = async (att?: Attendance | null, foraDaArea?: { distancia: number | null }) => {
      if (!daVez()) return;
      // Modo galpão (decisão 14): bipe curto quando o ponto entra.
      if (modoGalpao) tocarBipe();
      const segundos = segundosParaVoltar(!!foraDaArea) ?? AUTO_LOGOUT_SECONDS;
      // Aparelho compartilhado: a tela volta ao início sozinha pra sessão deste funcionário não sobrar
      // logada pro próximo da fila. Armada ANTES de recarregar o painel: se a rede travar no
      // recarregamento, a tela volta mesmo assim (05/10/2026).
      voltarSozinhoEm(segundos);
      // Quem acabou de bater: a câmera não o reconhece de novo logo em seguida (ver recemBatidosRef).
      const agora = Date.now();
      recemBatidosRef.current = [
        ...recemBatidosRef.current.filter((r) => r.ate > agora && r.employeeId !== employee.id),
        { employeeId: employee.id, descriptor: faceDescriptor ?? undefined, ate: agora + RECEM_BATIDO_MS },
      ];
      // 1) Limpa qualquer erro residual ANTES de recarregar o dashboard
      setClockMsg(null);
      // 2) Recarrega dados (loadDashboard também reseta clockMsg)
      await loadDashboard(employee, true);
      if (!daVez()) return;
      // 3) Define a mensagem de sucesso como estado final, após o reload
      const autoNote = ` · a tela volta ao início em ${segundos}s`;
      if (foraDaArea) {
        const nome = markingPosition ? MARKING_LABELS[markingPosition] : (type === 'entry' ? 'Entrada' : 'Saída');
        const metros = foraDaArea.distancia != null ? ` (${Math.round(foraDaArea.distancia)} m)` : '';
        setClockMsg(`⚠️ ${nome} registrada às ${now()} FORA da área permitida${metros} — avise o supervisor${autoNote}`);
      } else if (markingPosition) {
        const label = MARKING_LABELS[markingPosition];
        const extra = markingPosition === 4 && att?.hours_worked != null
          ? ` — ${formatHours(att.hours_worked)}`
          : '';
        setClockMsg(`✅ ${label} registrada às ${now()}${extra}${autoNote}`);
      } else if (type === 'entry') {
        setClockMsg(`✅ Entrada registrada às ${now()}${autoNote}`);
      } else {
        setClockMsg(`✅ Saída registrada às ${now()}${att ? ` — ${formatHours(att.hours_worked)}` : ''}${autoNote}`);
      }
    };

    try {
      const result = await callClockValidated(type, controller.signal, markingPosition, faceDescriptor);
      if (!daVez()) return;
      if (!result.success) {
        // Mesmo com success=false, o servidor pode ter gravado. Confirma — e, se gravou com
        // `fraud`, foi FORA da área (ver setSuccessMsg).
        const gravado = await conferirNoBanco();
        if (!daVez()) return;
        if (gravado) {
          await setSuccessMsg(result.attendance ?? gravado, foraDaAreaDe(gravado, result));
          return;
        }
        avisarFalha(clockFailureMessage(result));
        return;
      }
      await setSuccessMsg(result.attendance);
    } catch (err) {
      if (!daVez()) return;
      // Timeout (AbortError) ou erro genérico → o servidor pode ter registrado mesmo assim.
      // Consultamos o estado atual antes de declarar falha.
      const isAbort = err instanceof DOMException && err.name === 'AbortError';
      if (isAbort) setClockMsg('⏳ Conexão lenta. Verificando registro...');
      const gravado = await conferirNoBanco();
      if (!daVez()) return;
      if (gravado) {
        await setSuccessMsg(gravado, foraDaAreaDe(gravado));
        return;
      }
      // O motivo de verdade (06/10/2026): recusa do servidor ("cadastro encerrado", "CPF não confere"...)
      // aparece com o texto dele; rede e prazo seguem com as mensagens de sempre.
      avisarFalha(clockErrorMessage(err));
    } finally {
      clearTimeout(abortTimer);
      // Perdeu a vez: o vigia, o "Registrando..." e a trava já são da sessão/batida nova.
      if (daVez()) {
        if (clockWatchdogRef.current) {
          clearTimeout(clockWatchdogRef.current);
          clockWatchdogRef.current = null;
        }
        setClockLoading(false);
        // Debounce de 3s — evita duplo clique mesmo que o usuário insista
        setTimeout(() => { if (daVez()) inFlightClockRef.current = false; }, 3000);
      }
    }
  };

  // Continuação da batida depois das travas (facial → executa, ou direto).
  const proceedClock = (type: 'entry' | 'exit', markingPosition?: MarkingPosition) => {
    if (faceGateActive) {
      setPendingClockType(type);
      // Posição é passada via ref para o callback do face gate.
      pendingMarkingPositionRef.current = markingPosition ?? null;
      return;
    }
    executeClock(type, markingPosition);
  };

  // Entrada principal do botão de ponto, na ordem:
  // 1. localização BLOQUEADA no navegador → instrui como liberar (não gasta
  //    tentativa nem gera bloqueio de bônus); se nunca foi pedida, o próprio
  //    navegador pergunta na hora da batida (fluxo normal)
  // 1.1 câmera BLOQUEADA (04/09/2026), só quando a facial é exigida → mesma
  //     instrução — sem isso, quem já negou a câmera uma vez cai direto no
  //     "reconhecimento falhou, procure o supervisor" pra sempre
  // 2. saída < QUICK_EXIT_CONFIRM_MINUTES da marcação anterior → confirmação
  //    (saídas fantasma de 10-15s: funcionário achava que era "confirmar entrada")
  // 3. facial ativa → overlay de verificação; senão → executa direto
  const performClock = async (type: 'entry' | 'exit', markingPosition?: MarkingPosition) => {
    if (!employee) return;
    if (inFlightClockRef.current || pendingClockType || confirmExit) return;
    setClockMsg(null);
    if (autoLogoutRef.current) { clearTimeout(autoLogoutRef.current); autoLogoutRef.current = null; }

    if (await isGeoPermissionDenied()) {
      setGeoBlocked(true);
      return;
    }
    if (faceGateActive && await isCameraPermissionDenied()) {
      setCameraBlocked(true);
      return;
    }

    // O GPS começa a procurar AGORA, junto com a verificação facial (ver GPS_ANTECIPADO_VALIDO_MS).
    anteciparPosicao();

    if (type === 'exit') {
      const minutesAgo = quickExitMinutes(marcacaoAnteriorDaSaida(todayRecord, markingPosition));
      if (minutesAgo != null) {
        setConfirmExit({ markingPosition, minutesAgo });
        return;
      }
    }

    proceedClock(type, markingPosition);
  };

  const handleClockIn = () => performClock('entry');
  const handleClockOut = () => performClock('exit');
  const handleMarking = (pos: MarkingPosition) => {
    const type: 'entry' | 'exit' = pos === 1 ? 'entry' : 'exit';
    performClock(type, pos);
  };

  // ─── Face recognition completion handlers ────────────────────────────────
  const handleFaceRegistrationComplete = async () => {
    if (!employee) return;
    // Recarrega employee p/ pegar face_registered atualizado e pula pro dashboard
    try {
      if (employee.cpf) {
        const fresh = await getEmployeeByCpf(employee.cpf, employee.company_id);
        if (fresh) setEmployee(fresh);
      }
    } catch { /* segue com o que tem */ }
    setFaceGateActive(true); // agora cadastrado, próximas batidas precisam verificar
    await loadDashboard(employee);
    setClockMsg(null); // entrada fresca no dashboard: zera qualquer msg residual
    setStep('dashboard');
  };

  const handleFaceClockVerifySuccess = (descriptor: number[]) => {
    const type = pendingClockType;
    const pos = pendingMarkingPositionRef.current ?? undefined;
    setPendingClockType(null);
    pendingMarkingPositionRef.current = null;
    // O rosto reconhecido segue junto pra o servidor reconferir (trava dura por empresa).
    if (type) executeClock(type, pos, descriptor);
  };

  const handleFaceClockVerifyFail = () => {
    setPendingClockType(null);
    pendingMarkingPositionRef.current = null;
    avisarFalha('❌ Reconhecimento facial falhou. Procure o supervisor.');
  };

  // 30/09/2026: a câmera nem abriu — "reconhecimento falhou" seria mentira (o rosto não foi olhado).
  const handleFaceClockCameraExit = () => {
    setPendingClockType(null);
    pendingMarkingPositionRef.current = null;
    avisarFalha('❌ A câmera não abriu — o ponto NÃO foi registrado. Tente de novo.');
  };

  // ─── Tablet de ponto: ativação (30/09/2026) ───────────────────────────────
  const abrirAtivacaoDoTablet = () => {
    setActivationCode('');
    setActivationError('');
    setActivated(null);
    setStep('device-activate');
  };

  const handleActivateDevice = async () => {
    setActivating(true);
    setActivationError('');
    try {
      const { token, device: tablet } = await activateClockDevice(activationCode);
      guardarSegredoDoTablet(token);
      setDeviceToken(token);
      setDevice(tablet);
      setDeviceCheck('conferido');
      setActivated(tablet);
    } catch (err) {
      setActivationError(mensagemDeErro(err, 'Não foi possível ativar o tablet. Tente de novo.'));
    } finally {
      setActivating(false);
    }
  };

  /** Depois de ativar: volta ao início, já como tablet (ou barrado, se não atende esta empresa). */
  const comecarComoTablet = () => {
    setActivated(null);
    setActivationCode('');
    if (company && activated && aparelhoBarradoNaEmpresa(company, activated)) {
      mostrarAparelhoBarrado(company.display_name);
      return;
    }
    setStep(defaultStep);
  };

  // Ponto sem CPF (04/09/2026): a câmera já identificou a pessoa, mostrou o
  // nome com 3s pra cancelar, e ninguém cancelou — troca pra essa pessoa e
  // deixa o efeito (acima) disparar o registro assim que `employee` atualizar.
  const handleFaceIdentifyConfirmed = async (
    emp: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition?: MarkingPosition,
    comprovante?: string,
  ) => {
    // Modo galpão (06/10/2026): a ficha reconhecida pode ser da OUTRA empresa do tablet — a tela
    // troca pra ela SÓ nesta sessão (como no CPF), antes da batida: o painel, a conferência no banco
    // e a volta ao início usam a empresa da tela.
    if (company && emp.company_id && emp.company_id !== company.id) {
      try {
        await trocarEmpresaDaTela(emp.company_id);
      } catch (err) {
        console.error('Tablet: não consegui abrir a empresa da pessoa reconhecida:', err);
        setErrorMsg('Não consegui abrir o seu cadastro agora (conexão). O ponto NÃO foi registrado — tente de novo.');
        setStep('error');
        if (ehTablet) voltarSozinhoEm(TABLET_VOLTA_APOS_FALHA_SEGUNDOS);
        return;
      }
    }
    pendingFaceIdentifyRef.current = { type, markingPosition, descriptor };
    setComprovanteFacial(comprovante);
    setBatidaPeloRosto(true);
    setEmployee(emp);
    setStep('dashboard');
  };

  const handleLogout = () => {
    // Batida em andamento perde a vez (ver batidaDaVezRef) e a tela fica livre pro próximo — antes,
    // a batida dele saía em silêncio até a anterior terminar (trava de duplo clique presa).
    batidaDaVezRef.current += 1;
    if (clockWatchdogRef.current) { clearTimeout(clockWatchdogRef.current); clockWatchdogRef.current = null; }
    inFlightClockRef.current = false;
    setClockLoading(false);
    // Tablet cuja conferência no servidor falhou (rede): tenta de novo a cada volta ao início.
    if (deviceCheck === 'falhou' && deviceToken) setDeviceCheck('pendente');
    if (autoLogoutRef.current) { clearTimeout(autoLogoutRef.current); autoLogoutRef.current = null; }
    voltarPraEmpresaDoTablet();
    if (barradoNaEmpresa(company)) {
      mostrarAparelhoBarrado(company?.display_name ?? null);
    } else {
      setStep(defaultStep);
    }
    setCpfInput('');
    setPin('');
    setNewPin('');
    setConfirmPin('');
    setComprovanteFacial(undefined);
    setBatidaPeloRosto(false);
    setSetupError('');
    setEmployee(null);
    setAvailableCompanies([]);
    setTodayRecord(null);
    setHistory([]);
    setClockMsg(null);
    setFaceGateActive(false);
    setPendingClockType(null);
    setConfirmExit(null);
    setGeoBlocked(false);
    setCameraBlocked(false);
  };

  /**
   * Tablet: tela LARGADA no meio (05/10/2026) — alguém começou pelo CPF, ficou na senha ou abriu o
   * painel e foi embora (com a câmera desligada atrás). Sem nenhum toque por
   * TABLET_TELA_LARGADA_SEGUNDOS, volta pro início pelo mesmo caminho do "Sair" (limpa CPF e senha,
   * a empresa volta pra casa). Toque ou tecla recomeçam a contagem. Não conta enquanto a tela espera
   * o servidor (CPF, senha, batida) nem na verificação do rosto (a pessoa só olha, sem tocar).
   */
  const handleLogoutRef = useRef(handleLogout);
  useEffect(() => { handleLogoutRef.current = handleLogout; });

  // Tablet barrado que voltou a valer na reconferência (ver TABLET_BARRADO_RECONFERE_MS): volta pro
  // início sozinho, pelo mesmo caminho do "Sair".
  useEffect(() => {
    if (step !== 'device-blocked' || deviceCheck !== 'conferido' || !device) return;
    if (!aparelhoBarradoNaEmpresa(company, device)) handleLogoutRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- só a resposta da reconferência importa
  }, [device, deviceCheck]);

  // Modo galpão: Localização NEGADA neste tablet (06/10/2026) — sem ela a 1ª batida do dia é recusada
  // e o rosto cairia na recusa em loop. A tela da câmera ganha um aviso FIXO pro responsável, que
  // some sozinho quando a permissão é liberada (o navegador avisa a mudança).
  const [localizacaoNegada, setLocalizacaoNegada] = useState(false);
  useEffect(() => {
    if (!modoGalpao || step !== 'face-scan' || !navigator.permissions?.query) return;
    let cancelado = false;
    let permissao: PermissionStatus | null = null;
    const atualizar = () => { if (!cancelado && permissao) setLocalizacaoNegada(permissao.state === 'denied'); };
    navigator.permissions.query({ name: 'geolocation' as PermissionName })
      .then((p) => {
        if (cancelado) return;
        permissao = p;
        atualizar();
        p.addEventListener('change', atualizar);
      })
      .catch((err: unknown) => console.warn('Modo galpão: não deu pra ler a permissão de localização:', err));
    return () => {
      cancelado = true;
      permissao?.removeEventListener('change', atualizar);
    };
  }, [modoGalpao, step]);
  const avisarLocalizacaoNegada = modoGalpao && step === 'face-scan' && localizacaoNegada;
  useEffect(() => {
    const largaveis: Step[] = ['cpf', 'pin', 'setup-pin', 'company-select', 'error', 'dashboard'];
    if (!ehTablet || !largaveis.includes(step) || loading || clockLoading || pendingClockType) return;
    let prazo = setTimeout(() => handleLogoutRef.current(), TABLET_TELA_LARGADA_SEGUNDOS * 1000);
    const aoTocar = () => {
      clearTimeout(prazo);
      prazo = setTimeout(() => handleLogoutRef.current(), TABLET_TELA_LARGADA_SEGUNDOS * 1000);
    };
    window.addEventListener('pointerdown', aoTocar);
    window.addEventListener('keydown', aoTocar);
    return () => {
      clearTimeout(prazo);
      window.removeEventListener('pointerdown', aoTocar);
      window.removeEventListener('keydown', aoTocar);
    };
  }, [ehTablet, step, loading, clockLoading, pendingClockType]);

  const hasEntry = todayRecord?.entry_time != null;
  const hasExit = todayRecord?.exit_time_full != null;

  // Sub-fase 2.10: 4 marcações. `marking_count` do funcionário manda; sem
  // valor próprio, herda o padrão da empresa (mesma semântica prometida pela
  // opção "Padrão" no cadastro e já usada em recalcAttendance) — antes disso
  // caía direto em 2, ignorando o default da empresa (achado 01/09, roadmap
  // item 2: Ponte Nova está com default_marking_count=4 mas nenhum
  // funcionário via a tela de 4 marcações por causa desse gap).
  const resolvedMarkingCount = employee?.marking_count ?? company?.default_marking_count ?? 2;
  const markingCount: 2 | 4 = resolvedMarkingCount === 4 ? 4 : 2;
  const nextMarkingPos = getNextMarkingPosition(todayRecord);

  // ─── UI ───────────────────────────────────────────────────────────────────

  // Deitado (tablet/celular na horizontal), o cabeçalho vira a coluna azul da esquerda — e aí
  // cabe nele uma `nota` (que em pé fica no conteúdo, como sempre).
  const Header = ({ title, subtitle, nota }: { title: string; subtitle?: string; nota?: string }) => (
    <div className="bg-blue-600 px-6 py-5 text-white text-center deitado:flex deitado:flex-col deitado:justify-center">
      <Clock className="w-10 h-10 mx-auto mb-2 opacity-90 deitado:w-14 deitado:h-14 deitado:mb-3" />
      <h1 className="text-xl font-bold deitado:text-2xl">{title}</h1>
      {subtitle && <p className="text-blue-100 text-sm mt-1 deitado:text-base">{subtitle}</p>}
      {nota && <p className="hidden deitado:block text-blue-100 text-sm mt-4 leading-snug">{nota}</p>}
    </div>
  );

  /*
   * O cartão (30/09/2026, tela de ponto no tablet): cada passo põe DOIS filhos nele — o cabeçalho
   * e o conteúdo. Em pé, um embaixo do outro, como sempre; deitado, lado a lado (grade de 2
   * colunas), que é o que faz a tela da senha caber sem rolar num tablet de 7" deitado. O tamanho
   * das letras e teclas no tablet vem do index.css (classe `tela-ponto`).
   * Altura: no navegador do celular, `dvh` é a altura que se VÊ (sem a barra de endereço por
   * cima). Vai com `supports-[...]` porque a ordem das classes no CSS gerado não segue a ordem
   * escrita aqui — `min-h-screen min-h-dvh` deixava o `min-h-screen` ganhando (conferido no
   * build). Navegador antigo que não conhece `dvh` fica no `min-h-screen`.
   */
  return (
    <div
      className="min-h-screen supports-[min-height:100dvh]:min-h-dvh bg-gradient-to-br from-blue-600 to-blue-800 flex items-center justify-center p-4"
      data-testid="tela-de-ponto"
      // Empresa que a tela está usando agora (no tablet, a da sessão — pode diferir da gravada no
      // aparelho; ver trocarEmpresaDaTela). Só pra conferência (testes / suporte).
      data-empresa={company?.id ?? ''}
    >
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden deitado:max-w-[48rem] deitado:grid deitado:grid-cols-[2fr_3fr]">

        {/* ── CARREGANDO: a tela ainda não sabe se começa no CPF ou na câmera (30/09/2026) ── */}
        {step === 'carregando' && (
          <>
            <Header
              title="Registro de Ponto"
              subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            />
            <div className="p-8 flex flex-col items-center gap-3 text-gray-500" data-testid="clock-carregando">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p className="text-sm">Preparando...</p>
            </div>
          </>
        )}

        {/* ── CPF ── */}
        {step === 'cpf' && (
          <>
            <Header
              title="Registro de Ponto"
              subtitle={new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
            />
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-2">
                  Digite seu CPF
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpfInput}
                  onChange={e => setCpfInput(formatCPFMask(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full text-center text-2xl font-mono tracking-widest px-4 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  onKeyDown={e => e.key === 'Enter' && cpfInput.replace(/\D/g, '').length === 11 && handleCpfSubmit()}
                />
                <p className="text-xs text-gray-400 text-center mt-2">Digite apenas os números do CPF</p>
              </div>
              <button
                onClick={handleCpfSubmit}
                disabled={cpfInput.replace(/\D/g, '').length !== 11 || loading}
                className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Continuar'}
              </button>
              {defaultStep === 'face-scan' && (
                <button
                  onClick={() => setStep('face-scan')}
                  className="w-full text-sm text-blue-500 hover:text-blue-700 py-1"
                >
                  ← Voltar pro reconhecimento facial
                </button>
              )}
              {/* Tablet de ponto (30/09/2026): quem é este aparelho, ou como ativá-lo. */}
              {device ? (
                <p className="text-xs text-center text-green-700" data-testid="clock-device-badge">
                  📟 Tablet autorizado: {device.name}
                </p>
              ) : ehTablet ? null : (
                <>
                  <LinkDaConsulta />
                  <button
                    onClick={abrirAtivacaoDoTablet}
                    className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
                  >
                    Ativar este aparelho como tablet de ponto
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ── APARELHO NÃO AUTORIZADO (trava "ponto só no tablet", 30/09/2026) ── */}
        {step === 'device-blocked' && (
          <>
            <Header title={modoGalpao ? 'Tablet desconectado' : 'Ponto só no tablet da empresa'} />
            <div className="p-6 text-center space-y-4" data-testid="device-blocked">
              <Tablet className="w-14 h-14 text-blue-600 mx-auto" />
              {modoGalpao ? (
                // Modo galpão (06/10/2026): quem está na frente não resolve isto — só o responsável.
                // Sem botão pro funcionário; a tela reconfere sozinha (TABLET_BARRADO_RECONFERE_MS).
                <>
                  <p className="text-gray-900 text-lg font-semibold" data-testid="tablet-desconectado">
                    Tablet desconectado — chame o responsável.
                  </p>
                  <p className="text-gray-600 text-sm">Ele confere sozinho a cada minuto e volta assim que for liberado.</p>
                </>
              ) : (
                <>
                  <p className="text-gray-700">
                    Este aparelho não está autorizado a registrar ponto
                    {empresaBarrada ? <> de <strong>{empresaBarrada}</strong></> : null}.
                  </p>
                  <p className="text-gray-600 text-sm">Use o <strong>tablet da empresa</strong>.</p>
                </>
              )}
              {/* Fora do tablet dá pra CONSULTAR (decisão do Victor, 30/09/2026) — bater, não. */}
              {!device && !modoGalpao && <LinkDaConsulta destaque />}
              {!modoGalpao && (
                <button
                  onClick={() => { setEmpresaBarrada(null); setCpfInput(''); setStep('cpf'); }}
                  className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]"
                >
                  Sou de outra empresa — digitar CPF
                </button>
              )}
              <button
                onClick={abrirAtivacaoDoTablet}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-1"
              >
                Ativar este aparelho como tablet de ponto
              </button>
            </div>
          </>
        )}

        {/* ── ATIVAR TABLET (código gerado pelo 2626 em Configurações, 30/09/2026) ── */}
        {step === 'device-activate' && (
          <>
            <Header title="Ativar tablet de ponto" />
            <div className="p-6 space-y-4" data-testid="device-activate">
              {activated ? (
                <div className="text-center space-y-4">
                  <CheckCircle className="w-14 h-14 text-green-600 mx-auto" />
                  <p className="text-gray-800 font-semibold">Tablet ativado: {activated.name}</p>
                  <p className="text-sm text-gray-600">
                    Este aparelho agora registra ponto de: <strong>{activated.companyNames.join(', ')}</strong>.
                  </p>
                  <button
                    onClick={comecarComoTablet}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700"
                  >
                    Começar
                  </button>
                </div>
              ) : (
                <>
                  <p className="text-sm text-gray-600 text-center">
                    Digite o <strong>código de ativação</strong> gerado pelo responsável em
                    Configurações → Tablets de ponto. O código vale 15 minutos.
                  </p>
                  <input
                    type="text"
                    value={activationCode}
                    onChange={(e) => setActivationCode(e.target.value.toUpperCase().slice(0, 9))}
                    onKeyDown={(e) => e.key === 'Enter' && activationCode.replace(/[^A-Za-z0-9]/g, '').length === 8 && !activating && handleActivateDevice()}
                    placeholder="XXXX-XXXX"
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    aria-label="Código de ativação"
                    className="w-full text-center text-2xl font-mono tracking-widest px-4 py-4 border-2 border-gray-300 rounded-xl focus:border-blue-500 focus:outline-none"
                  />
                  {activationError && (
                    <p className="text-sm text-red-600 text-center font-medium">{activationError}</p>
                  )}
                  <button
                    onClick={handleActivateDevice}
                    disabled={activationCode.replace(/[^A-Za-z0-9]/g, '').length !== 8 || activating}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                  >
                    {activating ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Ativar tablet'}
                  </button>
                  <button
                    onClick={() => handleLogout()}
                    className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2"
                  >
                    <ChevronLeft className="w-4 h-4" /> Voltar
                  </button>
                </>
              )}
            </div>
          </>
        )}

        {/* ── COMPANY SELECT (CPF presente em 2+ empresas) ── */}
        {step === 'company-select' && (
          <>
            <Header
              title="Em qual empresa você está hoje?"
              subtitle="Selecione para continuar"
            />
            <div className="p-6 space-y-3">
              {availableCompanies.map(c => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleCompanyPick(c)}
                  disabled={loading}
                  className="w-full p-4 border-2 border-gray-200 rounded-xl hover:border-blue-500 hover:bg-blue-50 active:scale-[0.98] transition-all text-left flex items-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Building2 className="w-6 h-6 text-blue-600 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-gray-900 truncate">{c.display_name}</p>
                    <p className="text-xs text-gray-500 truncate">{c.city}</p>
                  </div>
                </button>
              ))}
              <button
                type="button"
                onClick={() => { setStep('cpf'); setAvailableCompanies([]); }}
                className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2"
              >
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            </div>
          </>
        )}

        {/* ── PIN ── */}
        {step === 'pin' && employee && (
          <>
            <Header title={`Olá, ${employee.name.split(' ')[0]}!`} subtitle="Digite seu PIN para continuar" />
            <div className="p-6 space-y-4">
              <div className="flex justify-center gap-3 mb-2">
                {Array.from({ length: Math.max(4, pin.length) }).map((_, i) => (
                  <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < pin.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} />
                ))}
              </div>
              <div className="grid grid-cols-3 gap-2">
                {KEYPAD.map((key, idx) => {
                  if (key === '') return <div key={idx} />;
                  if (key === '⌫') return (
                    <button key={idx} onClick={() => setPin(p => p.slice(0, -1))} className="py-4 text-xl font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all">⌫</button>
                  );
                  return (
                    <button key={idx} onClick={() => pin.length < 6 && setPin(p => p + key)} className="py-4 text-2xl font-bold text-gray-800 bg-gray-50 rounded-xl hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all border border-gray-200">
                      {key}
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handlePinSubmit}
                disabled={pin.length < 4 || loading}
                className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Confirmar PIN'}
              </button>
              <button onClick={() => { setStep('cpf'); setPin(''); }} className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2">
                <ChevronLeft className="w-4 h-4" /> Voltar
              </button>
            </div>
          </>
        )}

        {/* ── SETUP PIN ── */}
        {step === 'setup-pin' && employee && (() => {
          const activePin = setupField === 'new' ? newPin : confirmPin;
          const setActivePin = setupField === 'new' ? setNewPin : setConfirmPin;
          return (
            <>
              {/* Deitado, a explicação vai pra coluna azul (30/09/2026): no tablet de 7" deitado
                  (600px de altura) ela empurrava o "Próximo" pra fora da tela. */}
              <Header title={`Olá, ${employee.name.split(' ')[0]}!`} subtitle="Criar sua senha de acesso" nota={TEXTO_DO_PRIMEIRO_ACESSO} />
              <div className="p-6 space-y-4">
                <p className="text-sm text-gray-600 text-center deitado:hidden">
                  {TEXTO_DO_PRIMEIRO_ACESSO}
                </p>

                {/* Field switcher */}
                <div className="flex gap-3">
                  {(['new', 'confirm'] as const).map(f => (
                    <div key={f} className={`flex-1 text-center py-2 rounded-lg text-xs font-medium border-2 transition-all ${setupField === f ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-400'}`}>
                      {f === 'new' ? 'Nova senha' : 'Confirmar senha'}
                    </div>
                  ))}
                </div>

                {/* Dot indicators */}
                <div className="flex justify-center gap-3 my-2">
                  {Array.from({ length: Math.max(4, activePin.length) }).map((_, i) => (
                    <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all ${i < activePin.length ? 'bg-blue-600 border-blue-600' : 'border-gray-300'}`} />
                  ))}
                </div>

                {/* Keypad */}
                <div className="grid grid-cols-3 gap-2">
                  {KEYPAD.map((key, idx) => {
                    if (key === '') return <div key={idx} />;
                    if (key === '⌫') return (
                      <button key={idx} onClick={() => setActivePin(p => p.slice(0, -1))} className="py-4 text-xl font-bold text-gray-600 bg-gray-100 rounded-xl hover:bg-gray-200 active:scale-95 transition-all">⌫</button>
                    );
                    return (
                      <button key={idx} onClick={() => activePin.length < 6 && setActivePin(p => p + key)} className="py-4 text-2xl font-bold text-gray-800 bg-gray-50 rounded-xl hover:bg-blue-50 hover:text-blue-700 active:scale-95 transition-all border border-gray-200">
                        {key}
                      </button>
                    );
                  })}
                </div>

                {setupError && (
                  <p className="text-sm text-red-600 text-center font-medium">{setupError}</p>
                )}

                {setupField === 'new' ? (
                  <button
                    onClick={() => { setSetupField('confirm'); setConfirmPin(''); setSetupError(''); }}
                    disabled={newPin.length < 4}
                    className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Próximo
                  </button>
                ) : (
                  <button
                    onClick={handleSavePin}
                    disabled={confirmPin.length < 4 || loading}
                    className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
                  >
                    {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Salvar senha'}
                  </button>
                )}

                {setupField === 'confirm' && (
                  <button onClick={() => { setSetupField('new'); setSetupError(''); }} className="w-full text-sm text-gray-400 hover:text-gray-600 flex items-center justify-center gap-1 py-2">
                    <ChevronLeft className="w-4 h-4" /> Corrigir nova senha
                  </button>
                )}
              </div>
            </>
          );
        })()}

        {/* ── DASHBOARD ── */}
        {step === 'dashboard' && employee && (
          <>
            {/* Header com nome e logout (deitado: coluna azul da esquerda, "Sair" embaixo do nome) */}
            <div className="bg-blue-600 px-5 py-4 text-white flex items-center justify-between deitado:flex-col deitado:justify-center deitado:gap-6 deitado:text-center">
              <div>
                <p className="text-xs text-blue-200 deitado:text-sm">Olá,</p>
                <p className="font-bold text-lg leading-tight deitado:text-2xl">{employee.name.split(' ')[0]}</p>
                <p className="text-xs text-blue-200 deitado:text-sm">
                  {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' })}
                </p>
              </div>
              <button
                onClick={handleLogout}
                className="flex items-center gap-1 px-3 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors text-sm"
              >
                <LogOut className="w-4 h-4" />
                Sair
              </button>
            </div>

            <div className="overflow-y-auto max-h-[80vh] pb-4">
              {/* ── Card do dia ── */}
              <div className="m-4 p-4 border-2 border-blue-200 rounded-xl bg-blue-50 space-y-3">
                <h2 className="font-semibold text-blue-900 text-sm uppercase tracking-wide">📅 Hoje</h2>

                {loading ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
                  </div>
                ) : markingCount === 4 ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      {([1, 2, 3, 4] as const).map(pos => {
                        const ts = getTimestampForPosition(todayRecord, pos);
                        const isNext = nextMarkingPos === pos;
                        return (
                          <div
                            key={pos}
                            className={`rounded-lg p-3 text-center border-2 ${
                              ts ? 'bg-white border-green-200' : isNext ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-200'
                            }`}
                          >
                            <p className="text-xs text-gray-500 mb-1 font-semibold">{pos}. {MARKING_LABELS[pos]}</p>
                            <p className={`font-mono font-bold text-base ${ts ? 'text-green-700' : isNext ? 'text-yellow-700' : 'text-gray-400'}`}>
                              {ts ? `✓ ${formatTime(ts)}` : isNext ? '⏳ pendente' : '—'}
                            </p>
                          </div>
                        );
                      })}
                    </div>

                    {nextMarkingPos == null && todayRecord?.hours_worked != null && (
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Total trabalhado</p>
                        <p className="font-bold text-blue-700 text-lg">{formatHours(todayRecord.hours_worked)}</p>
                        {todayRecord.night_hours != null && todayRecord.night_hours > 0 && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center justify-center gap-1">
                            <Moon className="w-3 h-3" />
                            {formatHours(todayRecord.night_hours)} noturnas
                          </p>
                        )}
                      </div>
                    )}

                    {clockMsg && (
                      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${clockMsg.startsWith('✅') ? 'bg-green-100 text-green-800' : clockMsg.startsWith('⚠️') ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>
                        {clockMsg}
                      </div>
                    )}

                    {nextMarkingPos != null ? (
                      <button
                        onClick={() => handleMarking(nextMarkingPos)}
                        disabled={clockLoading}
                        aria-busy={clockLoading}
                        className="w-full py-4 bg-blue-600 text-white font-bold text-base rounded-xl hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {clockLoading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                          : <><Clock className="w-5 h-5" /> Bater {MARKING_LABELS[nextMarkingPos]}</>}
                      </button>
                    ) : (
                      <div className="flex items-center justify-center gap-2 py-2 text-green-700 font-medium text-sm">
                        <CheckCircle className="w-5 h-5" />
                        Ponto completo hoje!
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Entrada</p>
                        <p className={`font-mono font-bold text-lg ${hasEntry ? 'text-green-700' : 'text-gray-400'}`}>
                          {hasEntry ? formatTime(todayRecord?.entry_time) : '--:--:--'}
                        </p>
                      </div>
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Saída</p>
                        <p className={`font-mono font-bold text-lg ${hasExit ? 'text-orange-600' : 'text-gray-400'}`}>
                          {hasExit ? formatTime(todayRecord?.exit_time_full) : '--:--:--'}
                        </p>
                      </div>
                    </div>

                    {hasEntry && hasExit && todayRecord?.hours_worked != null && (
                      <div className="bg-white rounded-lg p-3 text-center">
                        <p className="text-xs text-gray-500 mb-1">Total trabalhado</p>
                        <p className="font-bold text-blue-700 text-lg">{formatHours(todayRecord.hours_worked)}</p>
                        {todayRecord.night_hours != null && todayRecord.night_hours > 0 && (
                          <p className="text-xs text-indigo-600 mt-1 flex items-center justify-center gap-1">
                            <Moon className="w-3 h-3" />
                            {formatHours(todayRecord.night_hours)} noturnas
                          </p>
                        )}
                      </div>
                    )}

                    {/* Mensagem de ação */}
                    {clockMsg && (
                      <div className={`rounded-lg px-3 py-2 text-sm font-medium ${clockMsg.startsWith('✅') ? 'bg-green-100 text-green-800' : clockMsg.startsWith('⚠️') ? 'bg-amber-100 text-amber-900' : 'bg-red-100 text-red-800'}`}>
                        {clockMsg}
                      </div>
                    )}

                    {/* Botões de ponto */}
                    {!hasEntry && (
                      <button
                        onClick={handleClockIn}
                        disabled={clockLoading}
                        aria-busy={clockLoading}
                        className="w-full py-4 bg-green-600 text-white font-bold text-lg rounded-xl hover:bg-green-700 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {clockLoading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                          : <><Clock className="w-5 h-5" /> REGISTRAR ENTRADA</>}
                      </button>
                    )}
                    {hasEntry && !hasExit && (
                      <button
                        onClick={handleClockOut}
                        disabled={clockLoading}
                        aria-busy={clockLoading}
                        className="w-full py-4 bg-orange-500 text-white font-bold text-lg rounded-xl hover:bg-orange-600 active:scale-95 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                      >
                        {clockLoading
                          ? <><Loader2 className="w-5 h-5 animate-spin" /> Registrando...</>
                          : <><Clock className="w-5 h-5" /> REGISTRAR SAÍDA</>}
                      </button>
                    )}
                    {hasEntry && hasExit && (
                      <div className="flex items-center justify-center gap-2 py-2 text-green-700 font-medium text-sm">
                        <CheckCircle className="w-5 h-5" />
                        Ponto completo hoje!
                      </div>
                    )}
                  </>
                )}
              </div>

              <MeusPontos history={history} />
            </div>
          </>
        )}

        {/* ── ERROR ── */}
        {step === 'error' && (
          <>
            <Header title="Ops!" />
            <div className="p-6 text-center space-y-4">
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="text-gray-600">{errorMsg}</p>
              <button onClick={() => setStep('cpf')} className="w-full py-4 bg-blue-600 text-white text-lg font-bold rounded-xl hover:bg-blue-700 transition-colors">
                Tentar novamente
              </button>
            </div>
          </>
        )}

      </div>

      {/* ── PONTO SEM CPF (overlay full-screen — câmera aberta, sem funcionário conhecido) ── */}
      {step === 'face-scan' && company && (
        <FaceIdentifyClock
          company={company}
          onConfirmed={handleFaceIdentifyConfirmed}
          onUseCpf={() => setStep('cpf')}
          deviceToken={deviceToken}
          deviceName={device?.name ?? null}
          onDeviceBlocked={() => mostrarAparelhoBarrado(company.display_name)}
          onRecognized={anteciparPosicao}
          onOcupado={setCameraOcupada}
          recemBatidos={recemBatidosRef}
          descansaSemNinguem={ehTablet}
          modoGalpao={modoGalpao}
        />
      )}

      {/* ── Modo galpão: Localização negada neste tablet — aviso FIXO pro responsável (06/10/2026) ── */}
      {avisarLocalizacaoNegada && (
        <div className="fixed inset-0 z-[60] bg-black/70 flex overflow-y-auto p-4" data-testid="galpao-localizacao-negada">
          <div className="m-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 text-center">📍 Chame o responsável</h2>
            <p className="text-gray-600 text-sm">
              A <strong>Localização</strong> está bloqueada neste tablet — sem ela o ponto não é aceito. O
              responsável libera assim:
            </p>
            {abertoComoApp() ? <PassosNoAppDoPonto permissao="Localização" /> : <PassosDaLocalizacaoNoNavegador />}
            <p className="text-gray-500 text-xs">Liberou? Este aviso some sozinho.</p>
          </div>
        </div>
      )}

      {/* ── Modo galpão: o resultado da batida PELO ROSTO, grande e sem botão (decisão 14) ── */}
      {step === 'dashboard' && modoGalpao && batidaPeloRosto && employee && (
        <div
          className="fixed inset-0 z-40 flex items-center justify-center p-6 text-center"
          style={{ background: 'radial-gradient(120% 90% at 50% 40%, #0E0B22 0%, #05060D 70%)' }}
          data-testid="galpao-resultado"
        >
          <div className="space-y-4 max-w-xl w-full">
            <p className="text-white font-extrabold leading-tight" style={{ fontSize: 'clamp(40px, 10vmin, 96px)' }}>
              {employee.name.split(' ')[0]}
            </p>
            <p className="text-white/60 text-lg">{employee.name}</p>
            {clockLoading || !clockMsg ? (
              <p className="text-white/80 text-2xl flex items-center justify-center gap-3">
                <Loader2 className="w-7 h-7 animate-spin" /> Registrando...
              </p>
            ) : (
              <p
                className={`text-2xl font-bold rounded-2xl px-5 py-4 ${
                  clockMsg.startsWith('✅') ? 'bg-green-500/20 text-green-300'
                    : clockMsg.startsWith('⚠️') ? 'bg-amber-500/20 text-amber-200'
                    : 'bg-red-500/20 text-red-300'
                }`}
                data-testid="galpao-resultado-mensagem"
              >
                {clockMsg}
              </p>
            )}
          </div>
        </div>
      )}

      {/* ── FACE REGISTRATION (overlay full-screen — primeiro acesso) ── */}
      {step === 'face-register' && employee && (
        <FaceRegistration
          employee={employee}
          pin={pinDaSessao}
          onComplete={handleFaceRegistrationComplete}
          onSkip={handleLogout}
        />
      )}

      {/* ── FACE VERIFICATION (overlay disparado pelo botão de ponto) ── */}
      {step === 'dashboard' && pendingClockType && employee && (
        <FaceVerification
          employee={employee}
          pin={pinDaSessao}
          onSuccess={handleFaceClockVerifySuccess}
          onFail={handleFaceClockVerifyFail}
          onCameraExit={handleFaceClockCameraExit}
          clockType={pendingClockType}
        />
      )}

      {/* ── CONFIRMAÇÃO DE SAÍDA RÁPIDA (trava anti-saída-fantasma) ──
           As 3 janelas por cima (30/09/2026): `overflow-y-auto` + `m-auto` em vez de
           `items-center` — janela mais alta que a tela (celular deitado) ROLA em vez de cortar o
           topo, e a que cabe continua no meio. */}
      {step === 'dashboard' && confirmExit && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex overflow-y-auto p-4">
          <div className="m-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4 text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto" />
            <h2 className="text-lg font-bold text-gray-900">Registrar SAÍDA agora?</h2>
            <p className="text-gray-600 text-sm">
              Sua {confirmExit.markingPosition === 2 ? 'entrada' : confirmExit.markingPosition === 4 ? 'volta do almoço' : 'entrada'} foi registrada{' '}
              <strong>
                {confirmExit.minutesAgo === 0 ? 'agora mesmo' : `há ${confirmExit.minutesAgo} minuto${confirmExit.minutesAgo === 1 ? '' : 's'}`}
              </strong>.
              Se você acabou de bater a entrada, <strong>não precisa confirmar nada</strong> — ela já está registrada.
            </p>
            <button
              onClick={() => { setConfirmExit(null); rearmarVoltaNoTablet(); }}
              className="w-full py-4 bg-blue-600 text-white text-base font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Não! Foi engano
            </button>
            <button
              onClick={() => {
                const pos = confirmExit.markingPosition;
                setConfirmExit(null);
                proceedClock('exit', pos);
              }}
              className="w-full py-3 bg-white text-orange-600 text-sm font-semibold rounded-xl border-2 border-orange-300 hover:bg-orange-50 transition-colors"
            >
              Sim, quero registrar SAÍDA mesmo
            </button>
          </div>
        </div>
      )}

      {/* ── LOCALIZAÇÃO BLOQUEADA (instrução pra liberar o GPS) ── */}
      {step === 'dashboard' && geoBlocked && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex overflow-y-auto p-4">
          <div className="m-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 text-center">📍 Localização bloqueada</h2>
            <p className="text-gray-600 text-sm">
              Para bater o ponto, o sistema precisa da sua localização — e ela está{' '}
              <strong>bloqueada no navegador</strong>. Libere assim:
            </p>
            {/* No app "Ponto" instalado não há cadeado nem endereço: o caminho é pelo Chrome (30/09/2026). */}
            {abertoComoApp() ? <PassosNoAppDoPonto permissao="Localização" /> : <PassosDaLocalizacaoNoNavegador />}
            <button
              onClick={() => { setGeoBlocked(false); rearmarVoltaNoTablet(); }}
              className="w-full py-4 bg-blue-600 text-white text-base font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Já liberei — vou tentar de novo
            </button>
          </div>
        </div>
      )}

      {/* ── CÂMERA BLOQUEADA (instrução pra liberar, 04/09/2026) ── */}
      {step === 'dashboard' && cameraBlocked && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-60 flex overflow-y-auto p-4">
          <div className="m-auto w-full max-w-sm bg-white rounded-2xl shadow-2xl p-6 space-y-4">
            <h2 className="text-lg font-bold text-gray-900 text-center">📷 Câmera bloqueada</h2>
            <p className="text-gray-600 text-sm">
              Para bater o ponto, o sistema precisa da sua câmera — e o navegador não está deixando
              este site usá-la. Libere assim:
            </p>
            {abertoComoApp() ? (
              <PassosNoAppDoPonto permissao="Câmera" />
            ) : (
              <>
                <ol className="text-gray-700 text-sm space-y-2 list-decimal list-inside bg-gray-50 rounded-xl p-3">
                  <li>Toque no <strong>cadeado</strong> (ou ⓘ) ao lado do endereço do site</li>
                  <li>Toque em <strong>Permissões</strong> (ou "Configurações do site")</li>
                  <li>Em <strong>Câmera</strong>, escolha <strong>Permitir</strong></li>
                </ol>
                {/* 30/09/2026: "diz que está bloqueada mas não está" — o Chrome passa a recusar
                    sozinho quando o pedido de câmera é fechado algumas vezes, e nas configurações
                    continua aparecendo "Perguntar". Escolher "Permitir" resolve. */}
                <p className="text-gray-500 text-xs">
                  Se lá aparecer <strong>"Perguntar"</strong>, mude mesmo assim para <strong>"Permitir"</strong>.
                  Se não aparecer, vá nas Configurações do celular → Aplicativos → seu navegador → Permissões → Câmera → Permitir.
                </p>
              </>
            )}
            <button
              onClick={() => { setCameraBlocked(false); rearmarVoltaNoTablet(); }}
              className="w-full py-4 bg-blue-600 text-white text-base font-bold rounded-xl hover:bg-blue-700 transition-colors"
            >
              Já liberei — vou tentar de novo
            </button>
          </div>
        </div>
      )}

    </div>
  );
};
