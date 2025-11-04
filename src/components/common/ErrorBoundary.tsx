import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { errorTracking } from '../../services/errorTracking';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  userId?: string;
  module?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary capturou erro:', error, errorInfo);

    this.setState({
      error,
      errorInfo,
    });

    errorTracking.captureError({
      userId: this.props.userId,
      errorType: 'js_error',
      severity: 'critical',
      message: error.message,
      stackTrace: error.stack,
      component: this.props.module || 'ErrorBoundary',
      module: this.props.module,
      errorContext: {
        componentStack: errorInfo.componentStack,
      },
    });
  }

  private handleReload = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.reload();
  };

  private handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
          <div className="max-w-2xl w-full bg-white rounded-lg shadow-lg p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="p-3 bg-red-100 rounded-full">
                <AlertTriangle className="w-8 h-8 text-red-600" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Ops! Algo deu errado
                </h1>
                <p className="text-gray-600 mt-1">
                  Ocorreu um erro inesperado na aplicação
                </p>
              </div>
            </div>

            <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
              <p className="text-sm font-semibold text-red-800 mb-2">
                Mensagem de erro:
              </p>
              <p className="text-sm text-red-700 font-mono">
                {this.state.error?.message || 'Erro desconhecido'}
              </p>
            </div>

            {this.state.error?.stack && (
              <details className="mb-6">
                <summary className="text-sm font-semibold text-gray-700 cursor-pointer hover:text-gray-900 mb-2">
                  Ver detalhes técnicos
                </summary>
                <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 mt-2">
                  <pre className="text-xs text-gray-700 overflow-x-auto whitespace-pre-wrap">
                    {this.state.error.stack}
                  </pre>
                </div>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium"
              >
                Tentar Novamente
              </button>
              <button
                onClick={this.handleReload}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Recarregar Página
              </button>
            </div>

            <div className="mt-6 pt-6 border-t border-gray-200">
              <p className="text-sm text-gray-600">
                Este erro foi automaticamente registrado e nossa equipe será notificada.
                Se o problema persistir, entre em contato com o suporte.
              </p>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
