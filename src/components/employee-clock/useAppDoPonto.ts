import { useEffect } from 'react';

/**
 * A TELA DE PONTO COMO APLICATIVO (30/09/2026). Pedido do Victor: no tablet, instalar pelo
 * navegador "como se fosse um aplicativo", ocupando a tela certinho, em pé ou deitado, sem nada
 * cortado e sem zoom. Decidido por ele: nome "Ponto" + o relógio azul, tela cheia total e tela
 * sempre acesa com o app de ponto aberto.
 *
 * Enquanto a tela de ponto está montada (e desfeito ao sair):
 *  1. aponta o arquivo do app (public/ponto.webmanifest). Só AQUI — então só a tela de ponto é
 *     instalável; o painel continua sendo site (sem trocar o index.html, que é o mesmo pra tudo);
 *  2. as marcas do iPhone/iPad (lá o nome e o modo app vêm delas);
 *  3. trava o zoom (pinça e toque duplo). No painel o zoom continua;
 *  4. a classe `tela-ponto` no <html>: o index.css aumenta letras e teclas no tablet;
 *  5. tela sempre acesa — SÓ aberto como app. No navegador comum (o celular pessoal de quem bate
 *     o ponto) o sistema não prende a tela de ninguém;
 *  6. o Chrome NÃO oferece instalar sozinho (a faixa "Adicionar Ponto à tela inicial"): quem
 *     instala é o responsável, no tablet, pelo menu ⋮ → "Instalar app". Sem isto, o celular
 *     pessoal de cada funcionário passaria a ver o convite — coisa que ninguém pediu.
 *
 * ⚠️ Sem `orientation` no arquivo do app, de propósito: o app gira com o próprio tablet. Com
 * "any", o Chrome do Android ignora a trava de rotação do aparelho — um tablet preso na parede
 * deitado giraria com um esbarrão.
 * ⚠️ Sem `viewport-fit=cover`, de propósito: com ele a tela entra atrás do entalhe da câmera (no
 * celular que tem), e cada canto teria que ser afastado à mão; sem ele o próprio aparelho deixa
 * a tela na área visível — nada fica escondido.
 */

export const ARQUIVO_DO_APP = '/ponto.webmanifest';
export const NOME_DO_APP = 'Ponto';
export const CLASSE_DA_TELA_DE_PONTO = 'tela-ponto';
export const VIEWPORT_DA_TELA_DE_PONTO = 'width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no';

const MARCA = 'data-tela-ponto';

const METAS_DO_APP: ReadonlyArray<readonly [string, string]> = [
  ['mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-capable', 'yes'],
  ['apple-mobile-web-app-title', NOME_DO_APP],
  ['apple-mobile-web-app-status-bar-style', 'default'],
];

/** Aberto pelo ícone do app (tela cheia / janela própria), e não numa aba do navegador? */
export function abertoComoApp(): boolean {
  if (typeof window === 'undefined') return false;
  if (typeof window.matchMedia === 'function'
      && ['fullscreen', 'standalone', 'minimal-ui'].some((modo) => window.matchMedia(`(display-mode: ${modo})`).matches)) {
    return true;
  }
  // iPhone/iPad: o modo app do Safari só avisa por aqui.
  return (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

/** Arquivo do app, marcas do iPhone, zoom travado e a classe do tablet. Devolve o "desfazer". */
function prepararAPagina(): () => void {
  const criados: HTMLElement[] = [];
  const adicionar = (el: HTMLElement) => {
    el.setAttribute(MARCA, '');
    document.head.appendChild(el);
    criados.push(el);
  };

  const manifesto = document.createElement('link');
  manifesto.rel = 'manifest';
  manifesto.href = ARQUIVO_DO_APP;
  adicionar(manifesto);

  for (const [name, content] of METAS_DO_APP) {
    const meta = document.createElement('meta');
    meta.name = name;
    meta.content = content;
    adicionar(meta);
  }

  let viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  const viewportOriginal = viewport?.getAttribute('content') ?? null;
  if (viewport) {
    viewport.setAttribute('content', VIEWPORT_DA_TELA_DE_PONTO);
  } else {
    viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = VIEWPORT_DA_TELA_DE_PONTO;
    adicionar(viewport);
  }

  document.documentElement.classList.add(CLASSE_DA_TELA_DE_PONTO);

  // Segura o convite automático de instalar (o menu do Chrome continua instalando normalmente).
  const semConviteAutomatico = (evento: Event) => { evento.preventDefault(); };
  window.addEventListener('beforeinstallprompt', semConviteAutomatico);

  return () => {
    criados.forEach((el) => el.remove());
    if (viewportOriginal !== null) viewport?.setAttribute('content', viewportOriginal);
    document.documentElement.classList.remove(CLASSE_DA_TELA_DE_PONTO);
    window.removeEventListener('beforeinstallprompt', semConviteAutomatico);
  };
}

/**
 * Tela sempre acesa enquanto o app de ponto está aberto. O aparelho SOLTA a trava sozinho quando
 * a tela apaga ou o app vai pro fundo — por isso ela é pedida de novo quando a tela volta (por
 * evento, não por tempo). Devolve o "desfazer".
 */
function manterTelaAcesa(): () => void {
  if (!abertoComoApp() || !('wakeLock' in navigator)) return () => undefined;
  let trava: WakeLockSentinel | null = null;
  let pedindo = false;
  let encerrado = false;

  const pedir = async () => {
    if (encerrado || pedindo || document.visibilityState !== 'visible') return;
    // `released` e não só o evento: o evento de soltura pode chegar depois do "a tela voltou".
    if (trava && !trava.released) return;
    pedindo = true;
    try {
      const nova = await navigator.wakeLock.request('screen');
      if (encerrado) {
        void nova.release();
        return;
      }
      trava = nova;
      nova.addEventListener('release', () => { if (trava === nova) trava = null; });
    } catch (err) {
      // Sem a trava a tela apaga pelo tempo do próprio aparelho (como antes); o ponto segue normal.
      console.warn('Não foi possível manter a tela acesa:', err);
    } finally {
      pedindo = false;
    }
  };

  const aoMudarVisibilidade = () => { void pedir(); };
  document.addEventListener('visibilitychange', aoMudarVisibilidade);
  void pedir();

  return () => {
    encerrado = true;
    document.removeEventListener('visibilitychange', aoMudarVisibilidade);
    if (trava && !trava.released) void trava.release();
    trava = null;
  };
}

export function useAppDoPonto(): void {
  useEffect(() => prepararAPagina(), []);
  useEffect(() => manterTelaAcesa(), []);
}
