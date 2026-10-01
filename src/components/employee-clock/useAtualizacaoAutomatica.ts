import { useEffect, useRef } from 'react';

/**
 * ATUALIZAÇÃO AUTOMÁTICA das telas do funcionário (01/10/2026).
 *
 * 🔴 O caso real: o Safari do iPhone guarda a aba aberta e, quando a pessoa volta nela, NÃO busca
 * a página de novo. Em 01/10 às 02:08 o Washington usou uma tela de ponto de antes de 30/09: o
 * servidor já exigia o PIN pra entregar o rosto cadastrado, a tela velha não mandava, e ela
 * mostrou "Não foi possível acessar a câmera" → "Reconhecimento facial falhou. Procure o
 * supervisor". Toda mudança no servidor quebra quem está com a tela velha aberta.
 *
 * Como resolve: cada build tem uma etiqueta (`__VERSAO_DO_APP__`, gravada no código) e o site
 * publica a etiqueta atual em `/version.json`. A tela confere ao voltar pra aba e a cada
 * INTERVALO_DE_CONFERENCIA_MS; se mudou, recarrega — mas SÓ quando `podeRecarregar` (ninguém no
 * meio de nada: sem CPF digitado, sem rosto sendo reconhecido, sem painel aberto). Se a versão nova
 * aparece com alguém usando, espera ele terminar.
 *
 * Duas travas contra recarregar em círculo (guardadas em sessionStorage, por aba):
 *  - UMA vez por etiqueta: se o `/version.json` novo chegar antes da página nova (cache do caminho);
 *  - no máximo uma recarga a cada INTERVALO_MINIMO_ENTRE_RECARGAS_MS, aconteça o que acontecer —
 *    o teste E2E pegou que uma etiqueta que mudasse a cada consulta deixava a página em branco,
 *    recarregando sem parar. Num deploy real ela não muda assim, mas a tela não pode depender disso.
 */

export const INTERVALO_DE_CONFERENCIA_MS = 5 * 60 * 1000;

/** O pedaço do fetch que a conferência usa (os testes entram com um servidor falso). */
export type Buscar = (url: string, init?: RequestInit) => Promise<Response>;
const buscarNoSite: Buscar = (url, init) => fetch(url, init);
const CHAVE_JA_RECARREGOU = 'ponto_recarregou_para_versao';
const CHAVE_ULTIMA_RECARGA = 'ponto_ultima_recarga_automatica';
export const INTERVALO_MINIMO_ENTRE_RECARGAS_MS = 2 * 60 * 1000;

/** A etiqueta deste build; null nos testes unitários (lá não há build). */
export function versaoDesteBuild(): string | null {
  return typeof __VERSAO_DO_APP__ === 'string' ? __VERSAO_DO_APP__ : null;
}

/** A etiqueta publicada no site, ou null se não deu pra saber (sem internet, resposta estranha). */
export async function versaoPublicada(buscar: Buscar = buscarNoSite): Promise<string | null> {
  try {
    const res = await buscar(`/version.json?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const corpo: unknown = await res.json();
    const versao = (corpo as { versao?: unknown } | null)?.versao;
    return typeof versao === 'string' && versao.length > 0 ? versao : null;
  } catch (err) {
    // Sem internet no galpão: fica na versão que está. A próxima conferência tenta de novo.
    console.warn('[atualização] não deu pra conferir a versão publicada:', err);
    return null;
  }
}

/** true = não recarregar agora (já recarregou pra esta etiqueta, ou recarregou há pouco). */
function recargaBarrada(versao: string, agoraMs: number): boolean {
  try {
    if (sessionStorage.getItem(CHAVE_JA_RECARREGOU) === versao) return true;
    const ultima = Number(sessionStorage.getItem(CHAVE_ULTIMA_RECARGA) ?? 0);
    return agoraMs - ultima < INTERVALO_MINIMO_ENTRE_RECARGAS_MS;
  } catch {
    // Sem sessionStorage (aba anônima restrita) não há como lembrar entre recargas: não recarrega
    // sozinha — melhor ficar na versão velha do que arriscar um círculo.
    return true;
  }
}

function marcarRecarregadoPara(versao: string, agoraMs: number): void {
  try {
    sessionStorage.setItem(CHAVE_JA_RECARREGOU, versao);
    sessionStorage.setItem(CHAVE_ULTIMA_RECARGA, String(agoraMs));
  } catch { /* recargaBarrada já devolve true nesse caso */ }
}

export interface OpcoesDaAtualizacao {
  /** true = ninguém está usando a tela agora (pode recarregar sem atrapalhar). */
  podeRecarregar: boolean;
  /** Pros testes; no app é a etiqueta do build, o fetch do navegador e o reload da página. */
  versaoLocal?: string | null;
  buscar?: Buscar;
  recarregar?: () => void;
}

export function useAtualizacaoAutomatica({
  podeRecarregar,
  versaoLocal = versaoDesteBuild(),
  buscar = buscarNoSite,
  recarregar = () => window.location.reload(),
}: OpcoesDaAtualizacao): void {
  const podeRef = useRef(podeRecarregar);
  const pendenteRef = useRef<string | null>(null);
  const recarregarRef = useRef(recarregar);
  const buscarRef = useRef(buscar);

  useEffect(() => {
    podeRef.current = podeRecarregar;
    recarregarRef.current = recarregar;
    buscarRef.current = buscar;
  });

  // Versão nova que chegou com alguém usando: recarrega assim que a tela ficar livre.
  useEffect(() => {
    const pendente = pendenteRef.current;
    if (podeRecarregar && pendente) {
      pendenteRef.current = null;
      if (recargaBarrada(pendente, Date.now())) return;
      marcarRecarregadoPara(pendente, Date.now());
      recarregarRef.current();
    }
  }, [podeRecarregar]);

  useEffect(() => {
    if (!versaoLocal) return;
    let ativo = true;

    const conferir = async () => {
      const publicada = await versaoPublicada(buscarRef.current);
      if (!ativo || !publicada || publicada === versaoLocal || recargaBarrada(publicada, Date.now())) return;
      if (podeRef.current) {
        marcarRecarregadoPara(publicada, Date.now());
        recarregarRef.current();
      } else {
        pendenteRef.current = publicada;
      }
    };

    const aoVoltarPraTela = () => { if (document.visibilityState === 'visible') void conferir(); };
    document.addEventListener('visibilitychange', aoVoltarPraTela);
    window.addEventListener('pageshow', aoVoltarPraTela);
    const intervalo = setInterval(() => { void conferir(); }, INTERVALO_DE_CONFERENCIA_MS);
    void conferir();

    return () => {
      ativo = false;
      document.removeEventListener('visibilitychange', aoVoltarPraTela);
      window.removeEventListener('pageshow', aoVoltarPraTela);
      clearInterval(intervalo);
    };
  }, [versaoLocal]);
}
