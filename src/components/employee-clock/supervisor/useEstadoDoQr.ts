import { useEffect, useRef, useState } from 'react';
import { ErroDoSupervisor, estadoDoQr, type EstadoDoQr, type StatusDoQr } from '../../../services/supervisorTablet';

/** Pergunta ao servidor a cada este tanto enquanto o QR está na tela (o tablet lê em segundos). */
export const PERGUNTA_A_CADA_MS = 1500;

/** Estados em que o QR não muda mais sozinho — a pergunta para. */
const FINAIS: ReadonlySet<StatusDoQr> = new Set(['confirmado', 'recusado', 'cancelado', 'vencido']);

/**
 * Acompanha um QR do supervisor (07/10/2026, entrega E). Pergunta de PERGUNTA_A_CADA_MS em
 * PERGUNTA_A_CADA_MS enquanto `ativo` e o status não for final (no 'capturado' segue perguntando:
 * o prazo de confirmar pode vencer). Sem internet, tenta de novo sozinho e avisa (`semRede`).
 * Sessão que acabou (401) vai pra `sessaoAcabou` — a página volta pro login.
 * `seguirDepoisDeConfirmar`: no QR de rosto com ponto, continua perguntando depois do 'confirmado'
 * (o celular espera a batida nova pra mostrar "Entrada 07:02"); quem desliga é a tela, quando a
 * batida aparece ou o tempo de esperar acaba.
 */
export function useEstadoDoQr(
  session: string,
  qrId: string | null,
  opts: { ativo: boolean; seguirDepoisDeConfirmar?: boolean },
): { estado: EstadoDoQr | null; semRede: boolean; sessaoAcabou: boolean } {
  const [estado, setEstado] = useState<EstadoDoQr | null>(null);
  const [semRede, setSemRede] = useState(false);
  const [sessaoAcabou, setSessaoAcabou] = useState(false);
  const opcoesRef = useRef(opts);
  useEffect(() => { opcoesRef.current = opts; });

  // QR novo: o estado do anterior não vale mais. (Separado da pergunta: desligar a espera do ponto
  // não pode apagar o estado final da tela.)
  useEffect(() => { setEstado(null); }, [qrId]);

  useEffect(() => {
    if (!qrId || !opts.ativo) return;
    let cancelado = false;
    let proxima: ReturnType<typeof setTimeout> | null = null;
    const perguntar = async () => {
      try {
        const e = await estadoDoQr(session, qrId);
        if (cancelado) return;
        setEstado(e);
        setSemRede(false);
        const final = FINAIS.has(e.status);
        const esperandoOPonto = e.status === 'confirmado' && opcoesRef.current.seguirDepoisDeConfirmar === true;
        if (final && !esperandoOPonto) return;
      } catch (err) {
        if (cancelado) return;
        if (err instanceof ErroDoSupervisor && err.status === 401) {
          setSessaoAcabou(true);
          return;
        }
        setSemRede(!(err instanceof ErroDoSupervisor));
        if (err instanceof ErroDoSupervisor) console.error('Estado do QR:', err.message);
      }
      if (!cancelado && opcoesRef.current.ativo) proxima = setTimeout(() => { void perguntar(); }, PERGUNTA_A_CADA_MS);
    };
    void perguntar();
    return () => {
      cancelado = true;
      if (proxima) clearTimeout(proxima);
    };
  }, [session, qrId, opts.ativo, opts.seguirDepoisDeConfirmar]);

  return { estado, semRede, sessaoAcabou };
}
