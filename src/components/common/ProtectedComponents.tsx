import { ReactNode } from 'react';

interface ProtectedComponentProps {
  hasPermission: boolean;
  children: ReactNode;
  fallback?: ReactNode;
  showMessage?: boolean;
}

export function ProtectedSection({ hasPermission, children, fallback = null, showMessage = false }: ProtectedComponentProps) {
  if (!hasPermission) {
    if (showMessage) {
      return (
        <div className="text-center py-8 text-gray-500">
          <p>Você não tem permissão para acessar esta seção.</p>
        </div>
      );
    }
    return <>{fallback}</>;
  }

  return <>{children}</>;
}

interface ProtectedButtonProps extends ProtectedComponentProps {
  disabled?: boolean;
  tooltip?: string;
}

export function ProtectedButton({
  hasPermission,
  children,
  disabled = false,
  tooltip = 'Você não tem permissão para esta ação'
}: ProtectedButtonProps) {
  if (!hasPermission) {
    return (
      <div className="relative group inline-block">
        <div className="opacity-50 cursor-not-allowed inline-block">
          {children}
        </div>
        <div className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-3 py-1 bg-gray-800 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-10">
          {tooltip}
        </div>
      </div>
    );
  }

  if (disabled) {
    return <div className="opacity-50 cursor-not-allowed inline-block">{children}</div>;
  }

  return <>{children}</>;
}

interface ProtectedTabProps {
  hasPermission: boolean;
  children: ReactNode;
}

export function ProtectedTab({ hasPermission, children }: ProtectedTabProps) {
  if (!hasPermission) {
    return null;
  }

  return <>{children}</>;
}
