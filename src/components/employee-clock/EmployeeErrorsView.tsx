import React, { useEffect, useState } from 'react';
import { Loader2, CheckCircle, AlertTriangle } from 'lucide-react';
import {
  getEmployeeErrorPeriods,
  getEmployeeErrorsByPeriod,
  PaymentPeriod,
  ErrorType,
} from '../../services/database';

interface EmployeeErrorsViewProps {
  employeeId: string;
}

function formatDateBR(d: string): string {
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

interface PeriodDetail {
  period: PaymentPeriod;
  individual_errors: Array<{ date: string; error_type: ErrorType; error_count: number; observations: string | null }>;
  triage_errors: Array<{ date: string; errors_share: number; observations: string | null }>;
  total_individual: number;
  total_triage: number;
}

export const EmployeeErrorsView: React.FC<EmployeeErrorsViewProps> = ({ employeeId }) => {
  const [loading, setLoading] = useState(true);
  const [details, setDetails] = useState<PeriodDetail[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const periods = await getEmployeeErrorPeriods(employeeId);
        const withErrors = periods.filter(p => p.has_errors);
        const loaded: PeriodDetail[] = [];
        for (const entry of withErrors) {
          const detail = await getEmployeeErrorsByPeriod(employeeId, entry.period.id);
          loaded.push(detail);
        }
        if (!cancelled) setDetails(loaded);
      } catch (err) {
        console.error('Erro ao carregar erros do funcionário:', err);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [employeeId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (details.length === 0) {
    return (
      <div className="mx-4 my-6 p-6 bg-green-50 border-2 border-green-200 rounded-xl text-center">
        <CheckCircle className="w-12 h-12 text-green-600 mx-auto mb-2" />
        <p className="font-semibold text-green-800 text-lg">Nenhum erro registrado</p>
        <p className="text-sm text-green-700 mt-1">Continue assim!</p>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-4">
      {details.map(detail => {
        const total = detail.total_individual + detail.total_triage;
        const isOpen = detail.period.status === 'open';
        return (
          <div
            key={detail.period.id}
            className="border-2 border-orange-200 rounded-xl bg-white overflow-hidden"
          >
            <div className="bg-orange-50 px-4 py-3 border-b border-orange-200">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-gray-900">
                  📅 {formatDateBR(detail.period.start_date)} a {formatDateBR(detail.period.end_date)}
                </p>
                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                  isOpen ? 'bg-yellow-100 text-yellow-800' : 'bg-green-100 text-green-800'
                }`}>
                  {isOpen ? '🟡 Período atual' : '✅ Pago'}
                </span>
              </div>
              {detail.period.label && (
                <p className="text-xs text-gray-600 mt-1">{detail.period.label}</p>
              )}
            </div>

            <div className="p-4 space-y-4">
              {detail.individual_errors.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">
                    Erros Individuais: {detail.total_individual} {detail.total_individual === 1 ? 'erro' : 'erros'}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {detail.individual_errors.map((e, i) => (
                      <li key={`${e.date}-${i}`} className="flex items-start gap-2 py-1 border-b border-gray-100 last:border-b-0">
                        <span className="text-gray-500 font-mono text-xs whitespace-nowrap mt-0.5">
                          {formatDateBR(e.date).slice(0, 5)}
                        </span>
                        <span className="text-gray-800 flex-1">
                          {e.observations || (e.error_type === 'value' ? 'Erro registrado' : `${e.error_count} erro(s)`)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {detail.triage_errors.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-gray-800 mb-2">
                    Erros de Triagem: {detail.total_triage} {detail.total_triage === 1 ? 'erro' : 'erros'}
                  </p>
                  <ul className="space-y-1 text-sm">
                    {detail.triage_errors.map((t, i) => (
                      <li key={`${t.date}-${i}`} className="flex items-start gap-2 py-1 border-b border-gray-100 last:border-b-0">
                        <span className="text-gray-500 font-mono text-xs whitespace-nowrap mt-0.5">
                          {formatDateBR(t.date).slice(0, 5)}
                        </span>
                        <span className="text-gray-800 flex-1">
                          Lote de triagem — <strong>{t.errors_share}</strong> {t.errors_share === 1 ? 'erro atribuído' : 'erros atribuídos'}
                          {t.observations && <span className="text-xs text-gray-500 ml-1">({t.observations})</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="pt-3 border-t-2 border-orange-100 flex items-center justify-between">
                <span className="text-sm font-semibold text-gray-700">Total:</span>
                <span className="text-lg font-bold text-orange-700">
                  {total} {total === 1 ? 'erro' : 'erros'}
                </span>
              </div>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-gray-400 text-center mt-4 flex items-center justify-center gap-1">
        <AlertTriangle className="w-3 h-3" />
        Os valores de desconto serão informados no pagamento.
      </p>
    </div>
  );
};
