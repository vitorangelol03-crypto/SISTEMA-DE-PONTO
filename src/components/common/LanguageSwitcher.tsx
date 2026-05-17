/**
 * Sub-fase 17.5.1: dropdown de troca de idioma.
 *
 * Lê locale atual via i18n e dispara reload após mudar pra re-renderizar
 * estado top-level com nova língua (alguns componentes não escutam mudança).
 *
 * Posicionado entre CompanySwitcher e botão Sair no Layout.
 */
import React from 'react';
import { Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { setLocale, getLocale, type SupportedLocale } from '../../i18n';

const OPTIONS: Array<{ code: SupportedLocale; label: string; flag: string }> = [
  { code: 'pt-BR', label: 'PT', flag: '🇧🇷' },
  { code: 'en', label: 'EN', flag: '🇺🇸' },
];

export const LanguageSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  const current = getLocale();

  React.useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const currentOpt = OPTIONS.find((o) => o.code === current) || OPTIONS[0];

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t('header.language')}
        title={t('header.language')}
        className="flex items-center gap-1.5 px-2.5 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-md transition-colors min-h-[44px]"
      >
        <Globe className="w-4 h-4" />
        <span className="hidden sm:inline font-medium">{currentOpt.label}</span>
      </button>

      {open && (
        <div
          role="listbox"
          className="absolute right-0 top-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg z-50 min-w-[140px]"
        >
          {OPTIONS.map((opt) => (
            <button
              key={opt.code}
              type="button"
              role="option"
              aria-selected={current === opt.code}
              onClick={() => {
                setLocale(opt.code);
                setOpen(false);
                window.location.reload();
              }}
              className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 ${current === opt.code ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
            >
              <span>{opt.flag}</span>
              <span>{opt.label === 'PT' ? 'Português (BR)' : 'English (US)'}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
