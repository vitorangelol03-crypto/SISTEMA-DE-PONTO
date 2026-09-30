/**
 * A TELA DE PONTO COMO APLICATIVO (30/09/2026) — useAppDoPonto.
 *
 * Pedido do Victor: instalar a tela de ponto no tablet "como se fosse um aplicativo", sem zoom,
 * encaixada, e com a tela sempre acesa com o app de ponto aberto. Aqui fica provado o que o gancho
 * faz na página (e que desfaz ao sair — o painel não pode herdar nada disso) e a regra da tela
 * acesa: SÓ aberto como app, pedida de novo quando a tela volta, e sem quebrar nada quando o
 * aparelho recusa. O mesmo comportamento no navegador de verdade: tests/128.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  useAppDoPonto,
  abertoComoApp,
  ARQUIVO_DO_APP,
  NOME_DO_APP,
  CLASSE_DA_TELA_DE_PONTO,
  VIEWPORT_DA_TELA_DE_PONTO,
} from '../../src/components/employee-clock/useAppDoPonto';
import { CameraProblem } from '../../src/components/employee-clock/CameraProblem';

function TelaDePonto() {
  useAppDoPonto();
  return null;
}

const VIEWPORT_DO_SITE = 'width=device-width, initial-scale=1.0';

/** Trava de tela como a do navegador: soltar marca `released` e avisa com o evento "release". */
class TravaFalsa extends EventTarget implements WakeLockSentinel {
  released = false;
  readonly type: WakeLockType = 'screen';
  onrelease: WakeLockSentinel['onrelease'] = null;
  avisaAoSoltar = true;

  async release(): Promise<void> {
    if (this.released) return;
    this.released = true;
    if (this.avisaAoSoltar) this.dispatchEvent(new Event('release'));
  }
}

let travas: TravaFalsa[] = [];
let pedidoDaTrava: ReturnType<typeof vi.fn<(tipo?: WakeLockType) => Promise<WakeLockSentinel>>>;
let visibilidade: DocumentVisibilityState = 'visible';

function instalarTravaDeTela() {
  travas = [];
  pedidoDaTrava = vi.fn(async () => {
    const trava = new TravaFalsa();
    travas.push(trava);
    return trava;
  });
  Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: { request: pedidoDaTrava } });
}

/** O modo em que a página foi aberta: aba do navegador ou app (tela cheia). */
function abertoEm(modo: 'navegador' | 'fullscreen' | 'standalone') {
  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (consulta: string): MediaQueryList => Object.assign(new EventTarget(), {
      matches: modo !== 'navegador' && consulta.includes(`display-mode: ${modo}`),
      media: consulta,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
    }),
  });
}

function mudarVisibilidade(estado: DocumentVisibilityState) {
  visibilidade = estado;
  document.dispatchEvent(new Event('visibilitychange'));
}

/** Espera as promessas pendentes (o pedido da trava é assíncrono). */
const esvaziarFila = () => new Promise<void>((r) => setTimeout(r, 0));

beforeEach(() => {
  document.head.innerHTML = `<meta name="viewport" content="${VIEWPORT_DO_SITE}">`;
  document.documentElement.className = '';
  visibilidade = 'visible';
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => visibilidade });
  instalarTravaDeTela();
  abertoEm('navegador');
});

afterEach(() => {
  Reflect.deleteProperty(navigator, 'wakeLock');
  Reflect.deleteProperty(window, 'matchMedia');
  Reflect.deleteProperty(document, 'visibilityState');
  Reflect.deleteProperty(navigator, 'standalone');
  vi.restoreAllMocks();
});

describe('useAppDoPonto — a página enquanto a tela de ponto está aberta', () => {
  it('aponta o arquivo do app "Ponto", põe as marcas do iPhone, trava o zoom e marca a tela — e ao sair devolve tudo', () => {
    const { unmount } = render(<TelaDePonto />);

    const manifesto = document.head.querySelectorAll('link[rel="manifest"]');
    expect(manifesto).toHaveLength(1);
    expect(manifesto[0].getAttribute('href')).toBe(ARQUIVO_DO_APP);
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-title"]')?.getAttribute('content')).toBe(NOME_DO_APP);
    expect(document.head.querySelector('meta[name="apple-mobile-web-app-capable"]')?.getAttribute('content')).toBe('yes');
    expect(document.head.querySelector('meta[name="mobile-web-app-capable"]')?.getAttribute('content')).toBe('yes');
    const viewport = document.head.querySelector('meta[name="viewport"]');
    expect(viewport?.getAttribute('content')).toBe(VIEWPORT_DA_TELA_DE_PONTO);
    expect(viewport?.getAttribute('content')).toContain('user-scalable=no');
    expect(document.documentElement.classList.contains(CLASSE_DA_TELA_DE_PONTO)).toBe(true);

    unmount();

    // O painel não herda nada: nem arquivo de app, nem zoom travado, nem a letra do tablet.
    expect(document.head.querySelector('link[rel="manifest"]')).toBeNull();
    expect(document.head.querySelector('meta[name^="apple-mobile-web-app"]')).toBeNull();
    expect(document.head.querySelector('meta[name="mobile-web-app-capable"]')).toBeNull();
    expect(document.head.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(VIEWPORT_DO_SITE);
    expect(document.documentElement.classList.contains(CLASSE_DA_TELA_DE_PONTO)).toBe(false);
  });

  it('o Chrome não oferece instalar sozinho na tela de ponto (quem instala é o responsável, pelo menu) — fora dela, oferece', () => {
    const convite = () => {
      const evento = new Event('beforeinstallprompt', { cancelable: true });
      window.dispatchEvent(evento);
      return evento.defaultPrevented;
    };
    const { unmount } = render(<TelaDePonto />);
    expect(convite(), 'na tela de ponto o convite automático é segurado').toBe(true);
    unmount();
    expect(convite(), 'fora da tela de ponto nada é segurado').toBe(false);
  });

  it('montar duas vezes seguidas (o React faz isso em desenvolvimento) não duplica nada', () => {
    const primeira = render(<TelaDePonto />);
    primeira.unmount();
    const segunda = render(<TelaDePonto />);
    expect(document.head.querySelectorAll('link[rel="manifest"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="apple-mobile-web-app-title"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="viewport"]')).toHaveLength(1);
    segunda.unmount();
  });

  it('página sem meta viewport: cria uma com o zoom travado (e tira ao sair)', () => {
    document.head.innerHTML = '';
    const { unmount } = render(<TelaDePonto />);
    expect(document.head.querySelector('meta[name="viewport"]')?.getAttribute('content')).toBe(VIEWPORT_DA_TELA_DE_PONTO);
    unmount();
    expect(document.head.querySelector('meta[name="viewport"]')).toBeNull();
  });
});

describe('abertoComoApp', () => {
  it('aba do navegador: não', () => {
    abertoEm('navegador');
    expect(abertoComoApp()).toBe(false);
  });

  it('tela cheia (o app instalado no Android) e janela própria: sim', () => {
    abertoEm('fullscreen');
    expect(abertoComoApp()).toBe(true);
    abertoEm('standalone');
    expect(abertoComoApp()).toBe(true);
  });

  it('iPhone/iPad aberto pelo ícone (navigator.standalone): sim', () => {
    Object.defineProperty(navigator, 'standalone', { configurable: true, value: true });
    expect(abertoComoApp()).toBe(true);
  });

  it('navegador sem matchMedia: não (e não quebra)', () => {
    Reflect.deleteProperty(window, 'matchMedia');
    expect(abertoComoApp()).toBe(false);
  });
});

describe('tela sempre acesa', () => {
  it('no navegador comum (o celular pessoal de quem bate o ponto) o sistema NÃO prende a tela', async () => {
    abertoEm('navegador');
    render(<TelaDePonto />);
    await esvaziarFila();
    expect(pedidoDaTrava).not.toHaveBeenCalled();
  });

  it('aberto como app: prende a tela; a tela apagou e voltou → pede de novo; ao sair, solta', async () => {
    abertoEm('fullscreen');
    const { unmount } = render(<TelaDePonto />);
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(1);
    expect(pedidoDaTrava).toHaveBeenCalledWith('screen');

    // A tela apagou: o aparelho solta a trava sozinho.
    visibilidade = 'hidden';
    await travas[0].release();
    mudarVisibilidade('hidden');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(1); // escondida: não pede

    // A tela voltou: pede de novo.
    mudarVisibilidade('visible');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(2);
    expect(travas[1].released).toBe(false);

    // Voltar de novo com a trava ainda valendo não pede outra.
    mudarVisibilidade('visible');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(2);

    unmount();
    expect(travas[1].released).toBe(true);
  });

  it('a trava já soltou mas o aviso de soltura ainda não chegou: quando a tela volta, pede de novo mesmo assim', async () => {
    abertoEm('fullscreen');
    render(<TelaDePonto />);
    await esvaziarFila();
    travas[0].avisaAoSoltar = false;
    await travas[0].release();
    mudarVisibilidade('visible');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(2);
  });

  it('abriu com a tela apagada: espera a tela voltar pra pedir', async () => {
    abertoEm('fullscreen');
    visibilidade = 'hidden';
    render(<TelaDePonto />);
    await esvaziarFila();
    expect(pedidoDaTrava).not.toHaveBeenCalled();
    mudarVisibilidade('visible');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(1);
  });

  it('o aparelho recusa (ex.: economia de bateria): avisa no console e a tela de ponto segue normal', async () => {
    abertoEm('fullscreen');
    const aviso = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    pedidoDaTrava.mockRejectedValueOnce(new DOMException('Wake Lock permission request denied', 'NotAllowedError'));
    const { unmount } = render(<TelaDePonto />);
    await esvaziarFila();
    expect(aviso).toHaveBeenCalledWith('Não foi possível manter a tela acesa:', expect.any(DOMException));
    // A tela voltou: tenta de novo (desta vez o aparelho deixa).
    mudarVisibilidade('visible');
    await esvaziarFila();
    expect(pedidoDaTrava).toHaveBeenCalledTimes(2);
    expect(travas[0].released).toBe(false);
    unmount();
  });

  it('saiu da tela antes da trava chegar: a trava que chega depois é solta na hora', async () => {
    abertoEm('fullscreen');
    let entregar: (trava: WakeLockSentinel) => void = () => undefined;
    pedidoDaTrava.mockImplementationOnce(() => new Promise<WakeLockSentinel>((r) => { entregar = r; }));
    const { unmount } = render(<TelaDePonto />);
    await esvaziarFila();
    unmount();
    const atrasada = new TravaFalsa();
    entregar(atrasada);
    await esvaziarFila();
    expect(atrasada.released).toBe(true);
  });

  it('navegador sem a função de tela acesa: não quebra', async () => {
    abertoEm('fullscreen');
    Reflect.deleteProperty(navigator, 'wakeLock');
    const { unmount } = render(<TelaDePonto />);
    await esvaziarFila();
    unmount();
  });
});

describe('câmera bloqueada: o passo a passo certo pra onde a tela está aberta', () => {
  const semAcao = () => undefined;

  it('no navegador: o cadeado ao lado do endereço (como sempre)', () => {
    abertoEm('navegador');
    render(<CameraProblem problema="bloqueada-no-navegador" onTentarDeNovo={semAcao} />);
    expect(screen.getByText(/ao lado do endereço do site/)).toBeInTheDocument();
    expect(screen.queryByText(/Configurações do site/, { selector: 'strong' })).toBeNull();
  });

  it('no app instalado (sem barra de endereço): pelo Chrome → Configurações do site → Câmera', () => {
    abertoEm('fullscreen');
    render(<CameraProblem problema="bloqueada-no-navegador" onTentarDeNovo={semAcao} />);
    expect(screen.queryByText(/ao lado do endereço do site/)).toBeNull();
    expect(screen.getByText('Chrome')).toBeInTheDocument();
    expect(screen.getByText('Configurações do site')).toBeInTheDocument();
    expect(screen.getByText('Câmera')).toBeInTheDocument();
  });
});
