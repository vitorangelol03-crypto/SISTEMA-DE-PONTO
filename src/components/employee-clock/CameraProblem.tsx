import React from 'react';
import type { ProblemaDeCamera } from './cameraAccess';
import { abertoComoApp } from './useAppDoPonto';

/**
 * O que a pessoa vê quando a câmera não abre (30/09/2026) — um texto por CAUSA, em vez do
 * "câmera bloqueada" pra tudo. A causa vem de classificarErroDeCamera (cameraAccess.ts).
 *
 * Os nomes dos botões de saída pro CPF contêm "CPF e senha" de propósito: o helper dos testes
 * (tests/helpers.ts, irAoCampoDeCpfDoPonto) procura por isso em qualquer fase da tela.
 */
interface CameraProblemProps {
  problema: ProblemaDeCamera;
  /** Tentar de novo — tem que ser chamado direto do toque (é o que faz o navegador perguntar). */
  onTentarDeNovo: () => void;
  /** Saída manual (ex.: digitar CPF e senha). */
  onSair?: () => void;
  rotuloSair?: string;
}

const PASSOS_DO_SITE = (
  <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside bg-gray-50 rounded-xl p-3 text-left">
    <li>Toque no <strong>cadeado</strong> (ou ⓘ) ao lado do endereço do site</li>
    <li>Toque em <strong>Permissões</strong> (ou "Configurações do site")</li>
    <li>Em <strong>Câmera</strong>, escolha <strong>Permitir</strong></li>
  </ol>
);

/**
 * No app "Ponto" instalado (tela cheia, 30/09/2026) não existe barra de endereço nem cadeado: a
 * permissão do site mora no Chrome do aparelho. Usado aqui e nas janelas de câmera/localização
 * bloqueada da tela de ponto.
 */
export const PassosNoAppDoPonto: React.FC<{ permissao: 'Câmera' | 'Localização' }> = ({ permissao }) => (
  <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside bg-gray-50 rounded-xl p-3 text-left">
    <li>Saia do app e abra o <strong>Chrome</strong> do aparelho</li>
    <li>Toque em <strong>⋮</strong> → <strong>Configurações</strong> → <strong>Configurações do site</strong></li>
    <li>Em <strong>{permissao}</strong>, toque no endereço do sistema de ponto e escolha <strong>Permitir</strong></li>
  </ol>
);

const PASSOS_DO_APARELHO = (
  <ol className="text-sm text-gray-700 space-y-1.5 list-decimal list-inside bg-gray-50 rounded-xl p-3 text-left">
    <li>Abra as <strong>Configurações</strong> do aparelho</li>
    <li>Toque em <strong>Aplicativos</strong> e escolha o navegador (ex.: <strong>Chrome</strong>)</li>
    <li>Toque em <strong>Permissões</strong> → <strong>Câmera</strong> → <strong>Permitir</strong></li>
  </ol>
);

export const CameraProblem: React.FC<CameraProblemProps> = ({
  problema,
  onTentarDeNovo,
  onSair,
  rotuloSair = 'Prefere entrar com CPF e senha?',
}) => {
  let titulo: string;
  let corpo: React.ReactNode;
  let rotuloTentar = 'Tentar de novo';

  switch (problema) {
    case 'bloqueada-no-navegador':
      titulo = '📷 Câmera bloqueada';
      rotuloTentar = 'Já liberei — vou tentar de novo';
      corpo = abertoComoApp() ? (
        <>
          <p className="text-sm text-gray-600 text-left">
            Este aparelho não está deixando o app de ponto usar a câmera. Libere assim:
          </p>
          <PassosNoAppDoPonto permissao="Câmera" />
        </>
      ) : (
        <>
          <p className="text-sm text-gray-600 text-left">
            O navegador não está deixando este site usar a câmera. Libere assim:
          </p>
          {PASSOS_DO_SITE}
          <p className="text-xs text-gray-500 text-left">
            Se lá aparecer <strong>"Perguntar"</strong>, mude mesmo assim para <strong>"Permitir"</strong> — o
            navegador passa a recusar sozinho quando o pedido de câmera é fechado algumas vezes.
            Se não achar, faça também pelas Configurações do aparelho → Aplicativos → navegador →
            Permissões → Câmera → Permitir.
          </p>
        </>
      );
      break;
    case 'bloqueada-no-aparelho':
      titulo = '📷 Câmera desligada no aparelho';
      rotuloTentar = 'Já liberei — vou tentar de novo';
      corpo = (
        <>
          <p className="text-sm text-gray-600 text-left">
            O site tem permissão, mas o <strong>aparelho</strong> não deixa o navegador usar a câmera. Libere assim:
          </p>
          {PASSOS_DO_APARELHO}
        </>
      );
      break;
    case 'permissao-pendente':
      titulo = '📷 Falta liberar a câmera';
      rotuloTentar = 'Ativar câmera';
      corpo = (
        <p className="text-sm text-gray-600 text-left">
          Toque no botão abaixo. Quando o aparelho perguntar se o site pode usar a câmera, escolha{' '}
          <strong>Permitir</strong>.
        </p>
      );
      break;
    case 'em-uso':
      titulo = '📷 Câmera ocupada';
      corpo = (
        <p className="text-sm text-gray-600 text-left">
          Outro aplicativo pode estar usando a câmera, ou ela travou. Feche os outros aplicativos que usam a
          câmera e toque em tentar de novo.
        </p>
      );
      break;
    case 'sem-camera':
      titulo = '📷 Câmera não encontrada';
      corpo = (
        <p className="text-sm text-gray-600 text-left">
          Não encontramos uma câmera neste aparelho. Confira se ela está funcionando e toque em tentar de novo.
        </p>
      );
      break;
    case 'sem-https':
      titulo = 'Erro na câmera';
      corpo = (
        <p className="text-sm text-gray-600 text-left">
          A câmera não está disponível neste navegador. Abra o site pelo endereço seguro (https) no navegador
          normal do aparelho.
        </p>
      );
      break;
    default:
      titulo = 'Erro na câmera';
      corpo = (
        <p className="text-sm text-gray-600 text-left">
          Não foi possível abrir a câmera. Toque em tentar de novo.
        </p>
      );
  }

  // `overflow-y-auto` + `m-auto` em vez de `items-center` (30/09/2026): no celular deitado esta
  // janela é mais alta que a tela — centralizada, ela cortava o título em cima e o botão de CPF
  // embaixo, sem ter como rolar. Agora rola; quando cabe, continua no meio.
  return (
    <div className="fixed inset-0 z-50 bg-gradient-to-br from-blue-600 to-blue-800 flex overflow-y-auto p-4">
      <div
        className="m-auto w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden p-6 text-center space-y-3"
        data-testid="camera-problem"
        data-problema={problema}
      >
        <h2 className="text-lg font-bold text-gray-800">{titulo}</h2>
        {corpo}
        <button
          onClick={onTentarDeNovo}
          className="w-full py-3 bg-blue-600 text-white font-semibold rounded-xl hover:bg-blue-700 min-h-[48px]"
        >
          {rotuloTentar}
        </button>
        {onSair && (
          <button
            onClick={onSair}
            className="w-full py-3 bg-gray-100 text-gray-700 font-semibold rounded-xl hover:bg-gray-200 min-h-[44px]"
          >
            {rotuloSair}
          </button>
        )}
      </div>
    </div>
  );
};
