import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, Loader2, UserCircle2, X } from 'lucide-react';
import { identifyFace, getEmployeeTodayAttendance, getEmployeeByCpf, Employee, Company } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';
import { FaceScanFrame, FaceScanVisual } from './FaceScanFrame';
import {
  CAMERA_DESCANSA_APOS_MS, FACE_MATCH_THRESHOLD, MarkingPosition, marcacaoAnterior, nomeDaMarcacaoAnterior,
  quickExitMinutes, resolveMarkingCount, resolveNextClockAction,
  GALPAO_AVISO_MS, GALPAO_ECONOMIA_OLHA_A_CADA_MS, GALPAO_IGNORA_APOS_AVISO_MS, GALPAO_SEGUNDA_FOTO_TENTATIVAS,
  GALPAO_TENTA_DE_NOVO_MS, decidirSegundaFoto, horaDaMarcacao,
} from './clockGuards';
import { useFrontCamera } from './useFrontCamera';
import { CameraProblem } from './CameraProblem';
import { abertoComoApp } from './useAppDoPonto';

/** Alguém que a câmera deve ignorar até `ate` (ms): quem acabou de bater, ou disse "Não" à pergunta. */
export interface RecemBatido {
  employeeId: string;
  /** O rosto da batida (quando houve) — deixa ignorar sem nem consultar o servidor. */
  descriptor?: number[];
  ate: number;
}

interface FaceIdentifyClockProps {
  company: Company;
  /** Depois de "NOME, confirma?" contar CONFIRM_COUNTDOWN_SECONDS sem cancelar — o pai faz o registro de fato. */
  onConfirmed: (
    employee: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition?: MarkingPosition,
    /** 30/09/2026: o comprovante do rosto reconhecido — é a "senha" da sessão no tablet. */
    comprovanteFacial?: string,
  ) => void;
  onUseCpf: () => void;
  /** Segredo do tablet (30/09/2026) — com a trava da empresa ligada, o servidor só identifica em tablet autorizado. */
  deviceToken?: string | null;
  /** Nome do tablet, quando este aparelho é um tablet ativo (aparece na barra de cima). */
  deviceName?: string | null;
  /** O servidor recusou o aparelho (trava ligada e este não é um tablet autorizado da empresa). */
  onDeviceBlocked?: () => void;
  /**
   * Alguém foi reconhecido e a contagem de confirmação vai começar (30/09/2026) — o pai
   * aproveita pra pedir o GPS já, em paralelo com a contagem, em vez de depois dela.
   */
  onRecognized?: () => void;
  /**
   * true enquanto alguém está sendo reconhecido/confirmado (01/10/2026) — o pai não recarrega a
   * tela pra versão nova nesse meio (useAtualizacaoAutomatica).
   */
  onOcupado?: (ocupado: boolean) => void;
  /**
   * Quem acabou de bater (05/10/2026), mantido pelo pai porque esta tela desmonta a cada batida.
   * Com a tela voltando em 8s no tablet, quem bateu e continua na frente era reconhecido de novo.
   */
  recemBatidos?: React.MutableRefObject<RecemBatido[]>;
  /**
   * Câmera descansa sem ninguém na frente (05/10/2026, pedido do Victor PRO TABLET): sem rosto por
   * CAMERA_DESCANSA_APOS_MS ela desliga e a tela mostra "Toque para bater o ponto". Quem decide é o
   * pai: só no tablet — no celular de cada um a câmera segue ligada, como sempre.
   */
  descansaSemNinguem?: boolean;
  /**
   * MODO GALPÃO — o tablet SEM TOQUE (06/10/2026, plano do tablet sem toque, entrega A; o 2626 liga
   * por tablet no cartão "Tablets de ponto"). Ligado:
   *  - no lugar do descanso com toque, o MODO ECONÔMICO: tela escura, câmera LIGADA olhando a cada
   *    GALPAO_ECONOMIA_OLHA_A_CADA_MS, e a tela acorda sozinha quando aparece um rosto;
   *  - batida a menos de 10 min da anterior vira AVISO sem botão ("você já bateu ... às HH:MM");
   *  - "Não reconheci — chame o supervisor";
   *  - no fim da contagem, a 2ª FOTO (saiu da frente ou trocou de pessoa → não grava; é ela que
   *    vai pro 1:1 do servidor);
   *  - câmera com problema e reconhecimento que não carregou tentam de novo sozinhos;
   *  - o rosto é procurado em TODAS as empresas do tablet.
   * Desligado (padrão): tudo exatamente como antes.
   */
  modoGalpao?: boolean;
}

type Phase =
  | 'loading'
  | 'scanning'
  | 'identifying'
  | 'identified'
  | 'confirm-exit'
  | 'no-match'
  | 'already-done'
  // Modo galpão (06/10/2026): avisos sem botão, que somem sozinhos em GALPAO_AVISO_MS.
  | 'recent-beat'
  | 'not-recorded';

// Pedido do Victor (04/09/2026): "não pode confundir, tem que ser robusta" —
// nunca gravamos ponto sem a pessoa ver o próprio nome e ter uma chance real
// de cancelar. Era 3s; baixado pra 2s em 30/09/2026 por decisão do Victor, pra dar folga
// na meta de 5–7s (rosto na câmera → ponto gravado). O nome e o "Não sou eu" continuam.
const CONFIRM_COUNTDOWN_SECONDS = 2;
// Depois de identificado (confirmado OU cancelado), ignora esta pessoa por um
// tempo — evita reconhecer a mesma pessoa de novo enquanto ela ainda está
// saindo de frente da câmera.
const SAME_PERSON_COOLDOWN_MS = 6000;
const SCAN_INTERVAL_MS = 700;
const IDENTIFY_COOLDOWN_MS = 1200; // não martela o servidor a cada frame
/**
 * Quanto tempo a tela aceita ficar em "Identificando..." antes de voltar a escanear.
 *
 * Existe porque ficar preso nessa fase foi exatamente a queixa dos supervisores em
 * 22/09/2026 ("fica só validando a facial deles, não entra"). A causa era outra (o loop
 * se desmontava no meio da chamada — ver o comentário do loop), mas uma resposta que
 * nunca chega (rede caindo no galpão) produz o MESMO sintoma. Então a tela se cura
 * sozinha: espera por CONDIÇÃO com limite, não por sorte.
 */
const IDENTIFY_TIMEOUT_MS = 9000;
/**
 * 30/09/2026 — quantas recusas SEGUIDAS antes de mostrar "Não reconheci".
 *
 * A 1:1 (com CPF) olha vários quadros e aceita o primeiro bom; a sem CPF mostrava o X
 * vermelho a cada quadro ruim (rosto ainda entrando na câmera, borrado, de lado) — a pessoa
 * via "Não reconheci" antes de parar na frente da câmera. Agora os quadros ruins seguem em
 * silêncio e o aviso só aparece se 3 seguidos (≈4s de rosto na câmera) não baterem.
 */
const NO_MATCH_BEFORE_WARNING = 3;
/**
 * 05/10/2026 — batida pelo rosto logo depois da anterior pede confirmação (como o botão de saída já
 * pedia). Quem continuava parado na frente do tablet depois de bater a entrada era reconhecido de
 * novo e ganhava uma SAÍDA automática com 0h trabalhada (aconteceu 2 vezes em 03/10); com 4
 * marcações, o mesmo daria uma volta do almoço com almoço de 0 min (ver marcacaoAnterior). Sem
 * resposta neste tempo, a pergunta some e a pessoa não é perguntada de novo por SAIDA_RAPIDA_ADIADA_MS.
 */
const SAIDA_RAPIDA_SEM_RESPOSTA_MS = 10_000;
const SAIDA_RAPIDA_ADIADA_MS = 60_000;
/*
 * 🔴 30/09/2026 — UMA DETECÇÃO POR VEZ (as 3 telas de câmera tinham o mesmo defeito).
 * O intervalo disparava uma detecção nova a cada volta SEM esperar a anterior terminar. Em
 * aparelho lento (ou na 1ª detecção, que prepara a placa de vídeo), elas se EMPILHAVAM e
 * disputavam o mesmo processador — medido no Chromium com a máquina carregada: 56 detecções
 * ao mesmo tempo e o 1º rosto achado só aos 35s; com a guarda, 1 por vez e rosto aos 13s. No
 * tablet isso é "fica procurando o rosto e não reconhece". Por isso o `detectInFlightRef`.
 */

/**
 * Tela de descanso do tablet (05/10/2026): fundo escuro, relógio grande e "Toque para bater o ponto".
 * Nada anima por quadro além do relógio (1x por segundo) — o objetivo é o tablet esfriar.
 *
 * `semToque` (06/10/2026, modo galpão): é o MODO ECONÔMICO — a mesma tela escura, mas a câmera
 * continua ligada e a tela acorda SOZINHA quando aparece um rosto, então o texto pede pra olhar, não
 * pra tocar. Tocar também acorda (quem toca por costume não fica sem resposta).
 */
const TelaDeDescanso: React.FC<{ onAcordar: () => void; onUseCpf: () => void; semToque?: boolean }> = ({
  onAcordar, onUseCpf, semToque = false,
}) => {
  const chamada = semToque ? 'Olhe para a câmera para bater o ponto' : 'Toque para bater o ponto';
  const [agora, setAgora] = useState(() => new Date());
  useEffect(() => {
    const relogio = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(relogio);
  }, []);
  const hora = agora.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  const dia = agora.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit' });
  return (
    <div
      role="button"
      tabIndex={0}
      aria-label={chamada}
      data-testid={semToque ? 'camera-economia' : 'camera-descanso'}
      // Toque (click), não "encostar" (pointerdown): sumir no encostar deixaria o resto do toque cair
      // no botão que estava embaixo (ex.: "Prefere digitar CPF") — o toque fantasma.
      onClick={onAcordar}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onAcordar(); } }}
      className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-6 px-6 text-center cursor-pointer select-none outline-none"
      style={{ background: 'radial-gradient(120% 90% at 50% 40%, #0E0B22 0%, #05060D 70%)' }}
    >
      <div>
        <p className="font-extrabold text-[#F4EEFF] leading-none tabular-nums" style={{ fontSize: 'clamp(64px, 18vmin, 160px)' }}>{hora}</p>
        <p className="mt-2 text-white/60 capitalize">{dia}</p>
      </div>
      <div
        className="rounded-2xl px-8 py-5 border border-transparent shadow-2xl"
        style={{ background: 'linear-gradient(rgba(10,8,22,0.9), rgba(10,8,22,0.9)) padding-box, linear-gradient(110deg, #A879FF, #39E6FF) border-box' }}
      >
        <p className="text-3xl font-bold text-[#F1E9FF]">{semToque ? '🙂' : '👆'} {chamada}</p>
        {semToque ? (
          <p className="mt-2 text-sm text-white/60">Pare na frente do tablet por uns segundos — a tela acende sozinha.</p>
        ) : (
          // Texto neutro: o descanso vale também no celular de quem abriu o ponto e esqueceu.
          <p className="mt-2 text-sm text-white/60">A câmera desligou pra poupar o aparelho. Ela liga na hora.</p>
        )}
      </div>
      <button
        onClick={(e) => { e.stopPropagation(); onUseCpf(); }}
        className="px-5 py-2.5 bg-[rgba(10,8,22,0.82)] text-[#F1E9FF] text-sm font-semibold rounded-full shadow-lg ring-1 ring-inset ring-white/25 hover:bg-[rgba(10,8,22,0.95)] transition-colors"
      >
        Prefere digitar CPF e senha?
      </button>
    </div>
  );
};

export const FaceIdentifyClock: React.FC<FaceIdentifyClockProps> = ({
  company, onConfirmed, onUseCpf, deviceToken = null, deviceName = null, onDeviceBlocked, onRecognized, onOcupado,
  recemBatidos, descansaSemNinguem = false, modoGalpao = false,
}) => {
  const {
    loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace, compareFaces,
    tentarDeNovo: tentarCarregarDeNovo,
  } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  /**
   * Câmera descansando (05/10/2026, pedido do Victor): sem ninguém na frente da câmera por
   * CAMERA_DESCANSA_APOS_MS, ela desliga (o tablet não esquenta 24h) e a tela mostra "Toque para
   * bater o ponto". O toque reabre só a câmera — o reconhecimento fica carregado na memória.
   */
  const [descansando, setDescansando] = useState(false);
  const descansandoRef = useRef(false);
  const ultimaAtividadeRef = useRef(Date.now());
  /**
   * Modo econômico (modo galpão, 06/10/2026): no lugar do descanso, a tela escurece mas a câmera
   * SEGUE ligada, olhando só a cada GALPAO_ECONOMIA_OLHA_A_CADA_MS; rosto na frente → volta sozinha.
   */
  const [economia, setEconomia] = useState(false);
  const economiaRef = useRef(false);
  const ultimaOlhadaRef = useRef(0);
  const modoGalpaoRef = useRef(modoGalpao);
  // Descansando, a câmera fica DESLIGADA (o hook fecha a trilha) e reabre ao acordar.
  const camera = useFrontCamera({ videoRef, habilitada: modelsReady && !descansando, componente: 'FaceIdentifyClock', companyId: company.id });
  const lastIdentifyAtRef = useRef(0);
  const identifyInFlightRef = useRef(false);
  const detectInFlightRef = useRef(false);
  const recentRef = useRef<Map<string, number>>(new Map()); // employeeId -> timestamp do último resultado
  /** Disse "Não" (ou não respondeu) à pergunta de saída rápida: ignorada por SAIDA_RAPIDA_ADIADA_MS. */
  const adiadosRef = useRef<RecemBatido[]>([]);
  /** Número da identificação em curso: resposta de uma identificação velha (estourou os 9s, a tela
   *  voltou a procurar ou descansou) é jogada fora — não pode abrir pergunta/contagem fora de hora. */
  const vezRef = useRef(0);
  const cameraAbertaRef = useRef(false);
  const compareFacesRef = useRef(compareFaces);
  const recemBatidosRef = useRef(recemBatidos);
  const descansaSemNinguemRef = useRef(descansaSemNinguem);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const noMatchStreakRef = useRef(0);

  const [phase, setPhase] = useState<Phase>('loading');
  const [identified, setIdentified] = useState<{
    employee: Employee;
    descriptor: number[];
    type: 'entry' | 'exit';
    markingPosition?: MarkingPosition;
    label: string;
  } | null>(null);
  const [countdown, setCountdown] = useState(0);
  /** Batida a menos de 10 min da anterior, esperando a pessoa confirmar (ver SAIDA_RAPIDA_*). */
  const [minutosDesdeAnterior, setMinutosDesdeAnterior] = useState<number | null>(null);
  const [comprovantePendente, setComprovantePendente] = useState<string | undefined>(undefined);
  /** Modo galpão: o aviso de batida recente ("Maria" + "já bateu a entrada às 07:42"). */
  const [avisoRecente, setAvisoRecente] = useState<{ nome: string; texto: string } | null>(null);
  /** Modo galpão: por que a 2ª foto não deixou gravar. */
  const [naoRegistrado, setNaoRegistrado] = useState<'saiu' | 'outra-pessoa' | null>(null);

  /**
   * 🔴 ACHADO EM 22/09/2026 — POR QUE A FACIAL SEM CPF "NÃO ENTRAVA".
   *
   * O loop de escaneamento dependia de `phase`. Dentro dele, ao achar um rosto, o código
   * fazia `setPhase('identifying')` **antes** de `await identifyFace(...)`. Essa troca de
   * fase re-executava o efeito: o cleanup punha `mounted = false` e matava o intervalo, e
   * o corpo novo saía na hora (`phase !== 'scanning'`). Quando a resposta do servidor
   * chegava, ela caía num `if (!mounted) return;` — **a identificação era jogada no lixo e
   * a tela ficava em "Identificando..." pra sempre**, sem reconhecer e sem voltar a
   * escanear. Era só clicar em "digitar CPF" pra sair, que é exatamente o que a equipe
   * relatou fazer.
   *
   * O irmão que funciona (`FaceVerification`, o 1:1 depois do CPF) não tinha o problema
   * porque a comparação dele é SÍNCRONA: nenhum `await` entre a troca de fase e a decisão.
   *
   * A correção é de raiz: o loop é armado UMA vez (quando os modelos ficam prontos) e só
   * é desarmado no unmount. Quem decide se escaneia agora é `phaseRef`, não a lista de
   * dependências do efeito — assim nenhuma troca de fase interrompe uma chamada em voo.
   * Tudo o que o loop usa de fora entra por ref, pelo mesmo motivo: um `onConfirmed` novo
   * a cada render do pai voltaria a derrubar o loop no meio.
   */
  const phaseRef = useRef<Phase>('loading');
  const identifyStartedAtRef = useRef(0);
  const companyRef = useRef(company);
  const detectFaceRef = useRef(detectFace);
  const deviceTokenRef = useRef(deviceToken);
  const onDeviceBlockedRef = useRef(onDeviceBlocked);
  const onRecognizedRef = useRef(onRecognized);
  const startConfirmRef = useRef<typeof startConfirmCountdown | null>(null);
  const resumeRef = useRef<typeof resumeScanning | null>(null);
  const onConfirmedRef = useRef(onConfirmed);

  const clearTimers = () => {
    if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
    if (resumeTimerRef.current) { clearTimeout(resumeTimerRef.current); resumeTimerRef.current = null; }
  };

  // A câmera abriu pela 1ª vez → começa a escanear. (Reaberturas depois disso — tela do
  // tablet que apagou e voltou — não mexem na fase: o loop só volta a achar rosto.)
  useEffect(() => {
    if (camera.estado === 'aberta' && phaseRef.current === 'loading') setPhase('scanning');
  }, [camera.estado]);

  useEffect(() => () => { clearTimers(); }, []);

  useEffect(() => {
    onOcupado?.(phase === 'identifying' || phase === 'identified' || phase === 'confirm-exit' || phase === 'already-done'
      || phase === 'recent-beat' || phase === 'not-recorded');
  }, [phase, onOcupado]);

  // Qualquer coisa acontecendo na câmera conta como "tem gente": adia o descanso.
  useEffect(() => { ultimaAtividadeRef.current = Date.now(); }, [phase]);

  // Voltou pra esta tela (outro app; tela do aparelho apagou e acendeu): conta como atividade — o
  // minuto recomeça, em vez de quem volta cair direto na tela escura (05/10/2026).
  useEffect(() => {
    const aoVoltar = () => { if (document.visibilityState === 'visible') ultimaAtividadeRef.current = Date.now(); };
    document.addEventListener('visibilitychange', aoVoltar);
    return () => document.removeEventListener('visibilitychange', aoVoltar);
  }, []);

  const acordar = useCallback(() => {
    ultimaAtividadeRef.current = Date.now();
    descansandoRef.current = false;
    setDescansando(false);
  }, []);

  /** Sai do modo econômico (rosto na frente, ou alguém tocou): volta ao ritmo normal. */
  const sairDaEconomia = useCallback(() => {
    ultimaAtividadeRef.current = Date.now();
    economiaRef.current = false;
    setEconomia(false);
  }, []);

  // Volta a escanear depois de um resultado (identificado/recusado/já completo)
  const resumeScanning = useCallback(() => {
    vezRef.current += 1;
    clearTimers();
    setIdentified(null);
    setCountdown(0);
    setMinutosDesdeAnterior(null);
    setComprovantePendente(undefined);
    setAvisoRecente(null);
    setNaoRegistrado(null);
    setPhase('scanning');
  }, []);

  const startConfirmCountdown = useCallback((
    employee: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition: MarkingPosition | undefined, label: string,
    comprovanteFacial?: string,
  ) => {
    clearTimers();
    setIdentified({ employee, descriptor, type, markingPosition, label });
    setPhase('identified');
    setCountdown(CONFIRM_COUNTDOWN_SECONDS);
    let left = CONFIRM_COUNTDOWN_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        if (modoGalpaoRef.current) {
          // Modo galpão: antes de gravar, a 2ª foto (ver conferirSegundaFoto).
          void segundaFotoRef.current?.(employee, descriptor, type, markingPosition, comprovanteFacial);
          return;
        }
        onConfirmed(employee, descriptor, type, markingPosition, comprovanteFacial);
      }
    }, 1000);
  }, [onConfirmed]);

  /**
   * Modo galpão (06/10/2026): a 2ª FOTO no fim da contagem — sem o toque do "Não sou eu", é ela que
   * segura a batida errada (ver decidirSegundaFoto). Procura o rosto até
   * GALPAO_SEGUNDA_FOTO_TENTATIVAS vezes seguidas (cada procura pega um quadro novo da câmera): um
   * quadro tremido sozinho não cancela a batida de quem continua parado ali.
   */
  const conferirSegundaFoto = useCallback(async (
    employee: Employee, primeira: number[], type: 'entry' | 'exit', markingPosition: MarkingPosition | undefined,
    comprovanteFacial?: string,
  ) => {
    const minhaVez = vezRef.current;
    const video = videoRef.current;
    let segunda: Float32Array | null = null;
    for (let tentativa = 0; video && !segunda && tentativa < GALPAO_SEGUNDA_FOTO_TENTATIVAS; tentativa++) {
      detectInFlightRef.current = true;
      try {
        segunda = await detectFaceRef.current(video);
      } catch (err) {
        console.error('Modo galpão: a 2ª foto falhou:', err);
      } finally {
        detectInFlightRef.current = false;
      }
      // "Não sou eu" tocado no meio, ou a tela já voltou a procurar: esta conferência não vale mais.
      if (vezRef.current !== minhaVez) return;
    }
    const decisao = decidirSegundaFoto(segunda ? compareFacesRef.current(segunda, primeira) : null);
    if (decisao === 'mesma-pessoa' && segunda) {
      // É ESTA foto (nova) que vai pro 1:1 do servidor — não a mesma que fez o 1:N.
      onConfirmedRef.current(employee, Array.from(segunda), type, markingPosition, comprovanteFacial);
      return;
    }
    setNaoRegistrado(decisao === 'outra-pessoa' ? 'outra-pessoa' : 'saiu');
    setPhase('not-recorded');
    // A pessoa NÃO fica ignorada: se continuar na frente, é reconhecida de novo na hora.
    resumeTimerRef.current = setTimeout(() => resumeRef.current?.(), GALPAO_AVISO_MS);
  }, []);
  const segundaFotoRef = useRef<typeof conferirSegundaFoto | null>(null);

  /**
   * Modo galpão (06/10/2026, decisão 3): batida a menos de QUICK_EXIT_CONFIRM_MINUTES da anterior
   * NÃO grava e não pergunta (ninguém toca no tablet): mostra "você já bateu ... às HH:MM" por
   * GALPAO_AVISO_MS e ignora a pessoa por GALPAO_IGNORA_APOS_AVISO_MS. Saída de verdade em menos de
   * 10 min, o supervisor ajusta no painel.
   */
  const avisarBatidaRecente = useCallback((
    employee: Employee, descriptor: number[], markingPosition: MarkingPosition | undefined, anteriorIso: string | null,
  ) => {
    clearTimers();
    adiadosRef.current.push({ employeeId: employee.id, descriptor, ate: Date.now() + GALPAO_IGNORA_APOS_AVISO_MS });
    const hora = horaDaMarcacao(anteriorIso);
    setAvisoRecente({
      nome: employee.name.split(' ')[0],
      texto: `já bateu ${nomeDaMarcacaoAnterior(markingPosition)}${hora ? ` às ${hora}` : ''}`,
    });
    setPhase('recent-beat');
    resumeTimerRef.current = setTimeout(() => resumeRef.current?.(), GALPAO_AVISO_MS);
  }, []);
  const avisarRecenteRef = useRef<typeof avisarBatidaRecente | null>(null);

  /** Batida logo depois da anterior: pergunta em vez de contar sozinho (ver SAIDA_RAPIDA_SEM_RESPOSTA_MS). */
  const askQuickExit = useCallback((
    employee: Employee, descriptor: number[], markingPosition: MarkingPosition | undefined, label: string,
    minutos: number, comprovanteFacial?: string,
  ) => {
    clearTimers();
    setIdentified({ employee, descriptor, type: 'exit', markingPosition, label });
    setMinutosDesdeAnterior(minutos);
    setComprovantePendente(comprovanteFacial);
    setPhase('confirm-exit');
    resumeTimerRef.current = setTimeout(() => {
      // Ninguém respondeu (a pessoa foi embora): não pergunta de novo tão cedo.
      adiadosRef.current.push({ employeeId: employee.id, descriptor, ate: Date.now() + SAIDA_RAPIDA_ADIADA_MS });
      resumeRef.current?.();
    }, SAIDA_RAPIDA_SEM_RESPOSTA_MS);
  }, []);
  const askQuickExitRef = useRef<typeof askQuickExit | null>(null);

  // As refs que o loop lê. Um efeito sem lista de dependências roda em TODO render, que é
  // exatamente o que se quer aqui: o loop nunca fica com uma versão velha e também nunca
  // é derrubado por causa de uma função nova.
  useEffect(() => {
    phaseRef.current = phase;
    companyRef.current = company;
    detectFaceRef.current = detectFace;
    deviceTokenRef.current = deviceToken;
    onDeviceBlockedRef.current = onDeviceBlocked;
    onRecognizedRef.current = onRecognized;
    startConfirmRef.current = startConfirmCountdown;
    resumeRef.current = resumeScanning;
    askQuickExitRef.current = askQuickExit;
    cameraAbertaRef.current = camera.estado === 'aberta';
    compareFacesRef.current = compareFaces;
    recemBatidosRef.current = recemBatidos;
    descansaSemNinguemRef.current = descansaSemNinguem;
    modoGalpaoRef.current = modoGalpao;
    onConfirmedRef.current = onConfirmed;
    segundaFotoRef.current = conferirSegundaFoto;
    avisarRecenteRef.current = avisarBatidaRecente;
  });

  // Modo galpão desligado com a tela aberta (o 2626 desligou): sai do modo econômico na hora.
  useEffect(() => {
    if (!modoGalpao && economiaRef.current) sairDaEconomia();
  }, [modoGalpao, sairDaEconomia]);

  // Modo galpão: ninguém toca no "Tentar de novo" — câmera com problema e reconhecimento que não
  // carregou tentam de novo SOZINHOS a cada GALPAO_TENTA_DE_NOVO_MS (cada falha arma a próxima).
  const { tentarSozinho: tentarCameraSozinho } = camera;
  useEffect(() => {
    if (!modoGalpao || camera.estado !== 'problema') return;
    const proxima = setTimeout(tentarCameraSozinho, GALPAO_TENTA_DE_NOVO_MS);
    return () => clearTimeout(proxima);
  }, [modoGalpao, camera.estado, tentarCameraSozinho]);
  useEffect(() => {
    if (!modoGalpao || !modelsError) return;
    const proxima = setTimeout(tentarCarregarDeNovo, GALPAO_TENTA_DE_NOVO_MS);
    return () => clearTimeout(proxima);
  }, [modoGalpao, modelsError, tentarCarregarDeNovo]);

  const cancelConfirm = () => {
    if (identified) recentRef.current.set(identified.employee.id, Date.now());
    resumeScanning();
  };

  const confirmarSaidaRapida = () => {
    if (!identified) return;
    const { employee, descriptor, markingPosition } = identified;
    const comprovante = comprovantePendente;
    clearTimers();
    onRecognized?.();
    onConfirmed(employee, descriptor, 'exit', markingPosition, comprovante);
  };

  const recusarSaidaRapida = () => {
    if (identified) {
      adiadosRef.current.push({ employeeId: identified.employee.id, descriptor: identified.descriptor, ate: Date.now() + SAIDA_RAPIDA_ADIADA_MS });
    }
    resumeScanning();
  };

  // Loop de escaneamento — detecta um rosto e, respeitando um cooldown entre
  // chamadas, pede pro servidor identificar (1:N roda SÓ no servidor).
  //
  // ⚠️ As dependências são SÓ `modelsReady` de propósito — ver o comentário grande acima.
  // Tudo o que muda entre renders é lido por ref.
  useEffect(() => {
    if (!modelsReady) return;
    let mounted = true;

    const interval = setInterval(async () => {
      const video = videoRef.current;
      if (!mounted || !video) return;

      // Resposta que nunca chega não pode prender a tela: volta a escanear.
      if (phaseRef.current === 'identifying'
          && identifyStartedAtRef.current > 0
          && Date.now() - identifyStartedAtRef.current > IDENTIFY_TIMEOUT_MS) {
        identifyInFlightRef.current = false;
        identifyStartedAtRef.current = 0;
        resumeRef.current?.(); // também invalida a resposta que ainda vier (vezRef)
        return;
      }

      if (descansandoRef.current) return; // câmera desligada: nada pra olhar
      if (phaseRef.current !== 'scanning' || identifyInFlightRef.current || detectInFlightRef.current) return;
      const now = Date.now();
      // O minuto sem ninguém só conta com a câmera ABERTA: abrindo ou com problema não descansa
      // (descansar uma câmera que não abriu deixava o "Tentar de novo" sem efeito).
      if (!cameraAbertaRef.current) {
        ultimaAtividadeRef.current = now;
      } else if (descansaSemNinguemRef.current && now - ultimaAtividadeRef.current > CAMERA_DESCANSA_APOS_MS) {
        if (modoGalpaoRef.current) {
          // Modo galpão: a câmera NÃO desliga (ninguém vai tocar pra religar) — a tela escurece e a
          // câmera passa a olhar devagar (modo econômico, decisão 2).
          if (!economiaRef.current) {
            economiaRef.current = true;
            setEconomia(true);
          }
        } else {
          // Ninguém na frente da câmera há CAMERA_DESCANSA_APOS_MS (só no tablet): desliga a câmera.
          vezRef.current += 1;
          descansandoRef.current = true;
          setDescansando(true);
          return;
        }
      }
      // Modo econômico: olha só a cada GALPAO_ECONOMIA_OLHA_A_CADA_MS (é o que esfria o tablet).
      if (economiaRef.current) {
        if (now - ultimaOlhadaRef.current < GALPAO_ECONOMIA_OLHA_A_CADA_MS) return;
        ultimaOlhadaRef.current = now;
      }
      if (now - lastIdentifyAtRef.current < IDENTIFY_COOLDOWN_MS) return;

      try {
        detectInFlightRef.current = true;
        let descriptor: Float32Array | null;
        try {
          descriptor = await detectFaceRef.current(video);
        } finally {
          detectInFlightRef.current = false;
        }
        if (!mounted) return;
        if (!descriptor) {
          // Sem rosto na câmera: quem chegar agora começa a contagem de recusas do zero.
          noMatchStreakRef.current = 0;
          return;
        }
        ultimaAtividadeRef.current = Date.now();
        // Rosto na frente no modo econômico: a tela acende sozinha e segue reconhecendo já.
        if (economiaRef.current) {
          economiaRef.current = false;
          setEconomia(false);
        }

        // Quem acabou de bater (ou disse "Não" à pergunta) e continua na frente: o rosto bate aqui
        // mesmo no tablet — nem consulta o servidor.
        const ignorados = [...(recemBatidosRef.current?.current ?? []), ...adiadosRef.current]
          .filter((r) => r.ate > now && r.descriptor);
        if (ignorados.some((r) => compareFacesRef.current(descriptor, r.descriptor as number[]) < FACE_MATCH_THRESHOLD)) {
          lastIdentifyAtRef.current = now;
          return;
        }

        lastIdentifyAtRef.current = now;
        identifyInFlightRef.current = true;
        identifyStartedAtRef.current = Date.now();
        const minhaVez = ++vezRef.current;
        setPhase('identifying');

        const company = companyRef.current;
        // Modo galpão: procura em TODAS as empresas do tablet (decisão 7 — Caratinga e Ponte Nova no
        // mesmo galpão); a resposta diz de qual empresa é a ficha reconhecida.
        const result = await identifyFace(
          company.id, Array.from(descriptor), deviceTokenRef.current,
          modoGalpaoRef.current ? { todasAsEmpresasDoTablet: true } : undefined,
        );
        if (!mounted || vezRef.current !== minhaVez) return;

        if (result.deviceBlocked) {
          onDeviceBlockedRef.current?.();
          return;
        }

        if (!result.matched || !result.employeeId) {
          noMatchStreakRef.current += 1;
          if (noMatchStreakRef.current < NO_MATCH_BEFORE_WARNING) {
            setPhase('scanning');
            return;
          }
          noMatchStreakRef.current = 0;
          setPhase('no-match');
          resumeTimerRef.current = setTimeout(() => { if (mounted) resumeRef.current?.(); }, 1500);
          return;
        }
        noMatchStreakRef.current = 0;

        // Cooldown: acabou de ser identificado/recusado agora mesmo — ignora
        // pra não reconhecer a mesma pessoa de novo enquanto ela some da tela.
        const lastSeen = recentRef.current.get(result.employeeId);
        const ignorada = [...(recemBatidosRef.current?.current ?? []), ...adiadosRef.current]
          .find((r) => r.ate > now && r.employeeId === result.employeeId);
        if (ignorada) {
          // Bateu sem rosto (pelo CPF) e continua na frente: o servidor reconheceu — guarda este rosto
          // pra, até o prazo acabar, nem consultar o servidor de novo (05/10/2026).
          if (!ignorada.descriptor) ignorada.descriptor = Array.from(descriptor);
          setPhase('scanning');
          return;
        }
        if (lastSeen && now - lastSeen < SAME_PERSON_COOLDOWN_MS) {
          setPhase('scanning');
          return;
        }

        // Busca o funcionário completo (marking_count etc.) — identifyFace só
        // devolve o mínimo (id/nome/cpf), de propósito.
        // 30/09/2026: as duas consultas saem JUNTAS (antes, uma esperava a outra). Meta do
        // Victor: da pessoa parar na frente até o ponto gravado, 5 a 7 segundos — e cada ida
        // ao servidor em fila custava ~0,5s no caminho.
        // A ficha pode ser da OUTRA empresa do tablet (modo galpão); sem a informação, é a da tela.
        const empresaDaFicha = result.companyId ?? company.id;
        const [emp, today] = await Promise.all([
          getEmployeeByCpf(result.cpf!, empresaDaFicha),
          getEmployeeTodayAttendance(result.employeeId, empresaDaFicha, { comprovanteFacial: result.comprovanteFacial }),
        ]);
        if (!mounted || vezRef.current !== minhaVez) return;
        if (!emp) { setPhase('scanning'); return; }

        const markingCount = resolveMarkingCount(
          emp,
          empresaDaFicha === company.id ? company : { default_marking_count: result.defaultMarkingCount ?? null },
        );
        const action = resolveNextClockAction(today, markingCount);
        if (!action) {
          recentRef.current.set(emp.id, now);
          setPhase('already-done');
          setIdentified({ employee: emp, descriptor: Array.from(descriptor), type: 'entry', label: emp.name.split(' ')[0] });
          resumeTimerRef.current = setTimeout(() => { if (mounted) resumeRef.current?.(); }, 2500);
          return;
        }

        if (action.type === 'exit') {
          const anterior = marcacaoAnterior(today, action.markingPosition);
          const minutos = quickExitMinutes(anterior);
          if (minutos != null) {
            if (modoGalpaoRef.current) {
              // Modo galpão: sem botão pra responder — avisa e NÃO grava (decisão 3).
              avisarRecenteRef.current?.(emp, Array.from(descriptor), action.markingPosition, anterior);
              return;
            }
            askQuickExitRef.current?.(emp, Array.from(descriptor), action.markingPosition, action.label, minutos, result.comprovanteFacial);
            return;
          }
        }

        onRecognizedRef.current?.();
        startConfirmRef.current?.(
          emp, Array.from(descriptor), action.type, action.markingPosition, action.label, result.comprovanteFacial,
        );
      } catch (err) {
        console.error('Erro no reconhecimento sem CPF:', err);
        setPhase('scanning');
      } finally {
        identifyInFlightRef.current = false;
        identifyStartedAtRef.current = 0;
      }
    }, SCAN_INTERVAL_MS);

    return () => { mounted = false; clearInterval(interval); };
  }, [modelsReady]);

  /**
   * O <video> fica SEMPRE montado; carregando/erro aparecem POR CIMA dele (30/09/2026).
   *
   * 🔴 Antes, a tela de "Carregando câmera" era devolvida SEM o <video>. A câmera abria com o
   * elemento ainda inexistente, a imagem não tinha onde entrar, a tela trocava pra câmera com o
   * vídeo PRETO — e só o vigia de "vídeo preto", 2s depois, fechava e abria a câmera de novo.
   * Toda abertura custava ~2,5s e DOIS pedidos de câmera seguidos (fechar e reabrir a câmera
   * tão rápido é o que faz muito Android responder "câmera ocupada").
   */
  const sobreposicao =
    camera.estado === 'problema' && camera.problema ? (
      // Câmera que não abriu: a causa certa, com a saída pro CPF sempre à mão (30/09/2026).
      <CameraProblem problema={camera.problema} onTentarDeNovo={camera.reabrir} onSair={onUseCpf} />
    ) : modelsError ? (
      // `overflow-y-auto` + `m-auto` (30/09/2026): janela mais alta que a tela rola, não corta o topo.
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex overflow-y-auto p-4">
        <div className="m-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center space-y-4">
          <X className="w-12 h-12 mx-auto text-red-600" />
          <h2 className="text-lg font-bold text-gray-800">Erro na câmera</h2>
          <p className="text-sm text-gray-600">{modelsError}</p>
          {modoGalpao && (
            <p className="text-sm text-gray-500" data-testid="galpao-tentando-de-novo">
              Tentando de novo sozinho a cada {GALPAO_TENTA_DE_NOVO_MS / 1000} s.
            </p>
          )}
          <button onClick={onUseCpf} className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[48px]">
            Entrar com CPF e senha
          </button>
        </div>
      </div>
    ) : (modelsLoading || phase === 'loading') ? (
      <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex overflow-y-auto p-4">
        <div className="m-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-8 text-center space-y-4">
          <Loader2 className="w-12 h-12 mx-auto animate-spin text-blue-600" />
          <div>
            <h2 className="text-lg font-bold text-gray-800 mb-1">Preparando reconhecimento...</h2>
            <p className="text-sm text-gray-500">Carregando câmera</p>
          </div>
          {/* Conexão lenta pode deixar isto demorado — nunca prende a pessoa sem saída. */}
          <button onClick={onUseCpf} className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]">
            Prefere digitar CPF e senha?
          </button>
        </div>
      </div>
    ) : null;
  const telaDaCamera = sobreposicao === null && !descansando && !economia;
  const botaoDeCpfNaTela = telaDaCamera && (phase === 'scanning' || phase === 'no-match' || phase === 'identifying');
  // Acordou do descanso: a câmera leva ~1s pra reabrir — avisa em vez de mostrar tela preta muda.
  const reabrindoCamera = phase === 'scanning' && camera.estado === 'abrindo';

  const visual: FaceScanVisual =
    reabrindoCamera           ? { color: 'blue',  pulse: true, showScanLine: true, label: '📷 Abrindo a câmera...' }
  : phase === 'scanning'      ? { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' }
  : phase === 'identifying'   ? { color: 'blue',  pulse: true,                     label: '🔎 Identificando...' }
  : phase === 'confirm-exit'  ? { color: 'blue',                                   label: `⚠️ ${identified?.employee.name.split(' ')[0]} — ${identified?.label} agora?` }
  : phase === 'identified'    ? { color: 'green', flash: 'success',                label: `👋 ${identified?.employee.name.split(' ')[0]} — ${identified?.label}` }
  : phase === 'already-done'  ? { color: 'green',                                  label: `✅ ${identified?.employee.name.split(' ')[0]}, ponto completo hoje!` }
  : phase === 'no-match'      ? { color: 'red',   shake: true,                     label: modoGalpao ? '❌ Não reconheci — chame o supervisor' : '❌ Não reconheci. Tente de novo.' }
  : phase === 'recent-beat'   ? { color: 'green',                                  label: `✅ ${avisoRecente?.nome}, você ${avisoRecente?.texto}` }
  : phase === 'not-recorded'  ? { color: 'red',   shake: true,                     label: naoRegistrado === 'outra-pessoa'
                                                                                     ? '⚠️ Trocou a pessoa na frente — ponto NÃO registrado'
                                                                                     : '⚠️ Saiu da frente antes do fim — ponto NÃO registrado' }
                               : { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <div className="flex items-center gap-2">
          <ScanFace className="w-5 h-5" />
          <p className="text-sm font-semibold">Reconhecimento facial — Registro de Ponto</p>
        </div>
        <div className="flex flex-col items-end gap-0.5 max-w-[45%]">
          {deviceName && (
            <p className="text-xs text-white/80 truncate max-w-full" data-testid="clock-device-badge">📟 {deviceName}</p>
          )}
          {/* Modo galpão: aberto no navegador comum a tela do tablet apaga sozinha — aviso pro responsável. */}
          {modoGalpao && !abertoComoApp() && (
            <p className="text-[11px] text-amber-300 truncate max-w-full" data-testid="aviso-abrir-pelo-app">
              ⚠️ Abra pelo app "Ponto" (aqui a tela pode apagar)
            </p>
          )}
        </div>
      </div>

      <div style={{ position: 'relative', flex: '1 1 auto', width: '100%', background: '#000' }}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          style={{
            position: 'absolute', top: 0, left: 0, width: '100%', height: '100%',
            objectFit: 'cover', transform: 'scaleX(-1)',
          }}
        />
        {/* 🔴 30/09/2026: o botão de CPF (abaixo) ficava EM CIMA do aviso — "Aproxime o rosto",
            "Identificando..." e "Não reconheci" não apareciam. Com o botão na tela, o aviso sobe
            pra cima dele: botão a 1,5rem do fundo + 2,5rem de altura = 4rem, e 12px de folga. */}
        {!descansando && (
          <FaceScanFrame
            visual={visual}
            countdown={phase === 'identified' ? countdown : 0}
            labelBottom={botaoDeCpfNaTela ? 'calc(4rem + 12px)' : undefined}
          />
        )}
      </div>

      {/* ── Confirmação (cancelável) ── visual "Malha neon" (05/10/2026), mesmos textos e botão */}
      {telaDaCamera && phase === 'identified' && identified && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div
            className="rounded-2xl shadow-2xl p-4 w-full max-w-sm text-center space-y-3 border border-transparent"
            style={{ background: 'linear-gradient(rgba(10,8,22,0.92), rgba(10,8,22,0.92)) padding-box, linear-gradient(110deg, #A879FF, #39E6FF) border-box' }}
          >
            <UserCircle2 className="w-10 h-10 mx-auto text-[#35F59B]" />
            {/* Modo galpão (decisão 14): nome GRANDE — ninguém chega perto pra ler. */}
            <p className={`text-white font-bold ${modoGalpao ? 'text-3xl leading-tight' : ''}`}>{identified.employee.name}</p>
            <p className="text-sm text-white/75">Registrando <strong className="text-[#39E6FF]">{identified.label}</strong> em {countdown}s...</p>
            <button
              onClick={cancelConfirm}
              className="w-full py-3 font-semibold rounded-xl min-h-[44px] text-[#F1E9FF] bg-[rgba(168,121,255,0.16)] border border-[rgba(168,121,255,0.5)] hover:bg-[rgba(168,121,255,0.28)]"
            >
              Não sou eu / Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ── Batida logo depois da anterior (05/10/2026): pergunta, não conta sozinho ── */}
      {telaDaCamera && phase === 'confirm-exit' && identified && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div
            className="rounded-2xl shadow-2xl p-4 w-full max-w-sm text-center space-y-3 border border-transparent"
            style={{ background: 'linear-gradient(rgba(10,8,22,0.94), rgba(10,8,22,0.94)) padding-box, linear-gradient(110deg, #FFC85A, #A879FF) border-box' }}
            data-testid="confirmar-saida-rapida"
          >
            <UserCircle2 className="w-10 h-10 mx-auto text-[#FFC85A]" />
            <p className="text-white font-bold">{identified.employee.name}</p>
            <p className="text-sm text-white/80">
              Você bateu {nomeDaMarcacaoAnterior(identified.markingPosition)} há{' '}
              <strong className="text-[#FFC85A]">{minutosDesdeAnterior === 0 ? 'menos de 1 minuto' : `${minutosDesdeAnterior} min`}</strong>
              {' '}— ela já está registrada. Se foi só isso, toque em "Não".
            </p>
            {/* O "Não" é o botão principal (como no aviso do botão): quem só queria confirmar a
                batida anterior não pode ganhar uma saída sem querer. */}
            <button
              onClick={recusarSaidaRapida}
              className="w-full py-4 text-base font-bold rounded-xl min-h-[52px] text-[#0A0816] bg-[#FFC85A] hover:bg-[#FFD57F]"
            >
              Não, foi engano
            </button>
            <button
              onClick={confirmarSaidaRapida}
              className="w-full py-3 text-sm font-semibold rounded-xl min-h-[44px] text-[#F1E9FF] bg-[rgba(168,121,255,0.16)] border border-[rgba(168,121,255,0.5)] hover:bg-[rgba(168,121,255,0.28)]"
            >
              Sim, registrar {identified.label} agora
            </button>
          </div>
        </div>
      )}

      {/* ── Modo galpão: batida a menos de 10 min — AVISO sem botão, some sozinho (decisão 3) ── */}
      {telaDaCamera && phase === 'recent-beat' && avisoRecente && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div
            className="rounded-2xl shadow-2xl p-4 w-full max-w-sm text-center space-y-2 border border-transparent"
            style={{ background: 'linear-gradient(rgba(10,8,22,0.94), rgba(10,8,22,0.94)) padding-box, linear-gradient(110deg, #35F59B, #39E6FF) border-box' }}
            data-testid="aviso-batida-recente"
          >
            <UserCircle2 className="w-10 h-10 mx-auto text-[#35F59B]" />
            <p className="text-white text-3xl font-bold leading-tight">{avisoRecente.nome}</p>
            <p className="text-white/85">Você {avisoRecente.texto}.</p>
            <p className="text-sm text-white/60">Nada foi registrado agora. Precisa sair antes de 10 min? Fale com o supervisor.</p>
          </div>
        </div>
      )}

      {/* ── Câmera descansando (05/10/2026): toque em qualquer lugar acorda ── */}
      {descansando && sobreposicao === null && <TelaDeDescanso onAcordar={acordar} onUseCpf={onUseCpf} />}

      {/* ── Modo econômico (modo galpão, 06/10/2026): câmera ligada, a tela acorda sozinha com rosto ── */}
      {economia && sobreposicao === null && <TelaDeDescanso semToque onAcordar={sairDaEconomia} onUseCpf={onUseCpf} />}

      {/* ── Alternativa manual (sempre disponível) ──
           'identifying' entrou em 22/09/2026: sem ele, a pessoa que caía nessa fase ficava
           SEM saída nenhuma na tela (foi a queixa da equipe). A fase agora se cura sozinha
           por timeout, e ainda assim o botão fica — preso no galpão ninguém pode ficar. */}
      {botaoDeCpfNaTela && (
        <div className="absolute bottom-6 left-0 right-0 z-20 flex justify-center px-4">
          <button
            onClick={onUseCpf}
            className="px-5 py-2.5 bg-[rgba(10,8,22,0.82)] text-[#F1E9FF] text-sm font-semibold rounded-full shadow-lg ring-1 ring-inset ring-white/25 hover:bg-[rgba(10,8,22,0.95)] transition-colors"
          >
            Prefere digitar CPF e senha?
          </button>
        </div>
      )}

      {sobreposicao}
    </div>
  );
};
