import React from 'react';
import { AlertCircle } from 'lucide-react';
import type { Attendance } from '../../services/database';
import { formatDateBR, formatHours, formatTime } from './formatoDoPonto';

/** Dias com presença, horas e horas noturnas do mês corrente, a partir do histórico. */
function resumoDoMes(history: Attendance[], hoje: Date = new Date()) {
  const monthStr = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}`;
  const monthRecords = history.filter(r => r.date.startsWith(monthStr) && r.status === 'present');
  return {
    totalDays: monthRecords.length,
    totalHours: monthRecords.reduce((s, r) => s + (r.hours_worked ?? 0), 0),
    totalNight: monthRecords.reduce((s, r) => s + (r.night_hours ?? 0), 0),
  };
}

/**
 * "Resumo do mês" + "Últimos 30 dias" do funcionário (30/09/2026, roadmap item 5).
 *
 * Era um pedaço do painel da tela de ponto; virou componente porque a consulta FORA da empresa
 * (/erros) mostra o mesmo — decisão do Victor: "pode ver tudo mas não bater o ponto". Só mostra:
 * não tem botão de bater ponto aqui dentro.
 */
export const MeusPontos: React.FC<{ history: Attendance[] }> = ({ history }) => {
  const summary = resumoDoMes(history);
  return (
    <>
      {/* ── Resumo do mês ── */}
      <div className="mx-4 mb-4 p-4 border border-gray-200 rounded-xl bg-white">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">📊 Resumo do Mês</h2>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-2xl font-bold text-blue-700">{summary.totalDays}</p>
            <p className="text-xs text-blue-600 mt-0.5">Dias presentes</p>
          </div>
          <div className="bg-green-50 rounded-lg p-3">
            <p className="text-lg font-bold text-green-700">{formatHours(summary.totalHours)}</p>
            <p className="text-xs text-green-600 mt-0.5">Horas totais</p>
          </div>
          <div className="bg-indigo-50 rounded-lg p-3">
            <p className="text-lg font-bold text-indigo-700">{formatHours(summary.totalNight)}</p>
            <p className="text-xs text-indigo-600 mt-0.5">Hs noturnas</p>
          </div>
        </div>
      </div>

      {/* ── Histórico 30 dias ── */}
      <div className="mx-4">
        <h2 className="font-semibold text-gray-700 text-sm uppercase tracking-wide mb-3">📋 Últimos 30 dias</h2>
        {history.length === 0 ? (
          <div className="text-center py-6 text-gray-400 text-sm">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-50" />
            Nenhum registro encontrado
          </div>
        ) : (
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Data</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Entrada</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Saída</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Horas</th>
                  <th className="px-3 py-2 text-left text-gray-500 font-medium">Adic. Not.</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {history.map(rec => {
                  return (
                    <tr key={rec.id} className={`${rec.status === 'absent' ? 'bg-red-50' : ''}`}>
                      <td className="px-3 py-2 font-medium text-gray-800">{formatDateBR(rec.date)}</td>
                      <td className="px-3 py-2 text-gray-600 font-mono">
                        {rec.entry_time ? formatTime(rec.entry_time) : (rec.status === 'absent' ? <span className="text-red-500">Falta</span> : '-')}
                      </td>
                      <td className="px-3 py-2 text-gray-600 font-mono">{formatTime(rec.exit_time_full)}</td>
                      <td className="px-3 py-2 text-gray-600">{formatHours(rec.hours_worked)}</td>
                      <td className="px-3 py-2 text-gray-600">
                        {rec.night_additional != null && rec.night_additional > 0
                          ? `R$${Number(rec.night_additional).toFixed(2)}`
                          : '-'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
};
