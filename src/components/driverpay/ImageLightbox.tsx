import React, { useEffect } from 'react';
import { X } from 'lucide-react';

/**
 * Visualizador de imagem/video em tela cheia (lightbox). Mostra a prova grande
 * por cima de tudo, sem baixar nada. Fecha no X, no fundo ou no Esc. z-[60] fica
 * acima dos modais (z-50). Quando a url e de video (extensao mp4/webm/mov/ogg/m4v),
 * renderiza um <video> com controles no lugar da <img>.
 */
export const ImageLightbox: React.FC<{ url: string | null; onClose: () => void }> = ({ url, onClose }) => {
  useEffect(() => {
    if (!url) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [url, onClose]);

  if (!url) return null;

  const isVideo = /\.(mp4|webm|mov|ogg|m4v)(\?|$)/i.test(url);

  return (
    <div
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-[60] p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        onClick={onClose}
        title="Fechar (Esc)"
        className="absolute top-4 right-4 text-white/80 hover:text-white"
      >
        <X className="w-8 h-8" />
      </button>
      {isVideo ? (
        <video
          src={url}
          controls
          autoPlay
          playsInline
          className="max-w-full max-h-[90vh] rounded-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      ) : (
        <img
          src={url}
          alt="Prova do desconto"
          className="max-w-full max-h-[90vh] object-contain rounded-md shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        />
      )}
    </div>
  );
};
