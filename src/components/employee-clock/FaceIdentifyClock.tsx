import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ScanFace, Loader2, UserCircle2, X } from 'lucide-react';
import { identifyFace, getEmployeeTodayAttendance, getEmployeeByCpf, Employee, Company } from '../../services/database';
import { useFaceApi } from '../../hooks/useFaceApi';
import { FaceScanFrame, FaceScanVisual } from './FaceScanFrame';
import { MarkingPosition, resolveMarkingCount, resolveNextClockAction } from './clockGuards';
import { useFrontCamera } from './useFrontCamera';
import { CameraProblem } from './CameraProblem';

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
}

type Phase =
  | 'loading'
  | 'scanning'
  | 'identifying'
  | 'identified'
  | 'no-match'
  | 'already-done';

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
/*
 * 🔴 30/09/2026 — UMA DETECÇÃO POR VEZ (as 3 telas de câmera tinham o mesmo defeito).
 * O intervalo disparava uma detecção nova a cada volta SEM esperar a anterior terminar. Em
 * aparelho lento (ou na 1ª detecção, que prepara a placa de vídeo), elas se EMPILHAVAM e
 * disputavam o mesmo processador — medido no Chromium com a máquina carregada: 56 detecções
 * ao mesmo tempo e o 1º rosto achado só aos 35s; com a guarda, 1 por vez e rosto aos 13s. No
 * tablet isso é "fica procurando o rosto e não reconhece". Por isso o `detectInFlightRef`.
 */

export const FaceIdentifyClock: React.FC<FaceIdentifyClockProps> = ({
  company, onConfirmed, onUseCpf, deviceToken = null, deviceName = null, onDeviceBlocked, onRecognized, onOcupado,
}) => {
  const { loading: modelsLoading, ready: modelsReady, error: modelsError, detectFace } = useFaceApi();
  const videoRef = useRef<HTMLVideoElement>(null);
  const camera = useFrontCamera({ videoRef, habilitada: modelsReady, componente: 'FaceIdentifyClock', companyId: company.id });
  const lastIdentifyAtRef = useRef(0);
  const identifyInFlightRef = useRef(false);
  const detectInFlightRef = useRef(false);
  const recentRef = useRef<Map<string, number>>(new Map()); // employeeId -> timestamp do último resultado
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
    onOcupado?.(phase === 'identifying' || phase === 'identified' || phase === 'already-done');
  }, [phase, onOcupado]);

  // Volta a escanear depois de um resultado (identificado/recusado/já completo)
  const resumeScanning = useCallback(() => {
    clearTimers();
    setIdentified(null);
    setCountdown(0);
    setPhase('scanning');
  }, []);

  const startConfirmCountdown = useCallback((
    employee: Employee, descriptor: number[], type: 'entry' | 'exit', markingPosition: MarkingPosition | undefined, label: string,
    comprovanteFacial?: string,
  ) => {
    setIdentified({ employee, descriptor, type, markingPosition, label });
    setPhase('identified');
    setCountdown(CONFIRM_COUNTDOWN_SECONDS);
    let left = CONFIRM_COUNTDOWN_SECONDS;
    countdownTimerRef.current = setInterval(() => {
      left -= 1;
      setCountdown(left);
      if (left <= 0) {
        if (countdownTimerRef.current) { clearInterval(countdownTimerRef.current); countdownTimerRef.current = null; }
        onConfirmed(employee, descriptor, type, markingPosition, comprovanteFacial);
      }
    }, 1000);
  }, [onConfirmed]);

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
  });

  const cancelConfirm = () => {
    if (identified) recentRef.current.set(identified.employee.id, Date.now());
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
        resumeRef.current?.();
        return;
      }

      if (phaseRef.current !== 'scanning' || identifyInFlightRef.current || detectInFlightRef.current) return;
      const now = Date.now();
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

        lastIdentifyAtRef.current = now;
        identifyInFlightRef.current = true;
        identifyStartedAtRef.current = Date.now();
        setPhase('identifying');

        const company = companyRef.current;
        const result = await identifyFace(company.id, Array.from(descriptor), deviceTokenRef.current);
        if (!mounted) return;

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
        if (lastSeen && now - lastSeen < SAME_PERSON_COOLDOWN_MS) {
          setPhase('scanning');
          return;
        }

        // Busca o funcionário completo (marking_count etc.) — identifyFace só
        // devolve o mínimo (id/nome/cpf), de propósito.
        // 30/09/2026: as duas consultas saem JUNTAS (antes, uma esperava a outra). Meta do
        // Victor: da pessoa parar na frente até o ponto gravado, 5 a 7 segundos — e cada ida
        // ao servidor em fila custava ~0,5s no caminho.
        const [emp, today] = await Promise.all([
          getEmployeeByCpf(result.cpf!, company.id),
          getEmployeeTodayAttendance(result.employeeId, company.id, { comprovanteFacial: result.comprovanteFacial }),
        ]);
        if (!mounted) return;
        if (!emp) { setPhase('scanning'); return; }

        const markingCount = resolveMarkingCount(emp, company);
        const action = resolveNextClockAction(today, markingCount);
        if (!action) {
          recentRef.current.set(emp.id, now);
          setPhase('already-done');
          setIdentified({ employee: emp, descriptor: Array.from(descriptor), type: 'entry', label: emp.name.split(' ')[0] });
          resumeTimerRef.current = setTimeout(() => { if (mounted) resumeRef.current?.(); }, 2500);
          return;
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
  const telaDaCamera = sobreposicao === null;
  const botaoDeCpfNaTela = telaDaCamera && (phase === 'scanning' || phase === 'no-match' || phase === 'identifying');

  const visual: FaceScanVisual =
    phase === 'scanning'      ? { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' }
  : phase === 'identifying'   ? { color: 'blue',  pulse: true,                     label: '🔎 Identificando...' }
  : phase === 'identified'    ? { color: 'green', flash: 'success',                label: `👋 ${identified?.employee.name.split(' ')[0]} — ${identified?.label}` }
  : phase === 'already-done'  ? { color: 'green',                                  label: `✅ ${identified?.employee.name.split(' ')[0]}, ponto completo hoje!` }
  : phase === 'no-match'      ? { color: 'red',   shake: true,                     label: '❌ Não reconheci. Tente de novo.' }
                               : { color: 'blue',  pulse: true, showScanLine: true, label: '🔍 Aproxime o rosto da câmera' };

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col">
      <div className="relative z-10 flex items-center justify-between px-4 py-3 bg-black/60 text-white">
        <div className="flex items-center gap-2">
          <ScanFace className="w-5 h-5" />
          <p className="text-sm font-semibold">Reconhecimento facial — Registro de Ponto</p>
        </div>
        {deviceName && (
          <p className="text-xs text-white/80 truncate max-w-[45%]" data-testid="clock-device-badge">📟 {deviceName}</p>
        )}
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
        <FaceScanFrame
          visual={visual}
          countdown={phase === 'identified' ? countdown : 0}
          labelBottom={botaoDeCpfNaTela ? 'calc(4rem + 12px)' : undefined}
        />
      </div>

      {/* ── Confirmação (cancelável) ── visual "Malha neon" (05/10/2026), mesmos textos e botão */}
      {telaDaCamera && phase === 'identified' && identified && (
        <div className="absolute bottom-24 left-0 right-0 z-30 flex justify-center px-4">
          <div
            className="rounded-2xl shadow-2xl p-4 w-full max-w-sm text-center space-y-3 border border-transparent"
            style={{ background: 'linear-gradient(rgba(10,8,22,0.92), rgba(10,8,22,0.92)) padding-box, linear-gradient(110deg, #A879FF, #39E6FF) border-box' }}
          >
            <UserCircle2 className="w-10 h-10 mx-auto text-[#35F59B]" />
            <p className="text-white font-bold">{identified.employee.name}</p>
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
