import React from 'react';
import { X } from 'lucide-react';

interface ModalShellProps {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  onClose: () => void;
  footer?: React.ReactNode;
  children: React.ReactNode;
  maxWidth?: string;
}

/** Casca de modal padrao da aba (overlay + header com icone + body scrollavel + footer). */
export const ModalShell: React.FC<ModalShellProps> = ({
  icon,
  title,
  subtitle,
  onClose,
  footer,
  children,
  maxWidth = 'sm:max-w-lg',
}) => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2 sm:p-4">
      <div className={`bg-white rounded-lg shadow-xl w-full max-w-[95vw] ${maxWidth} max-h-[92vh] flex flex-col`}>
        <div className="flex items-start justify-between gap-3 px-4 sm:px-5 py-4 border-b border-gray-200">
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-blue-600 flex-shrink-0">{icon}</span>
            <div className="min-w-0">
              <h3 className="text-base font-semibold text-gray-900 break-words">{title}</h3>
              {subtitle && <p className="text-xs text-gray-500 mt-0.5 break-words">{subtitle}</p>}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 flex-shrink-0 min-h-[36px] min-w-[36px] flex items-center justify-center"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-4 overflow-y-auto flex-1">{children}</div>

        {footer && (
          <div className="px-4 sm:px-5 py-3.5 border-t border-gray-200 bg-gray-50 flex justify-end gap-2 flex-wrap">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};
