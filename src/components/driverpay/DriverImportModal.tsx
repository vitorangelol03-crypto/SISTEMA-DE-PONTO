import React, { useRef, useState } from 'react';
import { Upload, FileSpreadsheet, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  DriverPlatform,
  DriverSeed,
  BulkImportResult,
  bulkImportDrivers,
} from '../../services/driverPay';
// Contrato consumido do agente de Import (../../utils/driverImport):
//   parseDriverSpreadsheet(file): Promise<DriverImportResult>
//   DriverImportResult = { drivers: DriverSeed[]; warnings: string[]; errors: string[] }
import { parseDriverSpreadsheet, type DriverImportResult } from '../../utils/driverImport';
import { ModalShell } from './ModalShell';

interface DriverImportModalProps {
  companyId: string;
  userId: string;
  platforms: DriverPlatform[];
  onClose: () => void;
  onImported: () => void | Promise<void>;
}

const MAX_SIZE = 5 * 1024 * 1024;

type Step = 'upload' | 'preview' | 'result';

const routeLabel = (seed: DriverSeed): string => {
  if (seed.routes && seed.routes.length > 0) return seed.routes.map((r) => r.city).join(', ');
  return seed.route ?? '—';
};

export const DriverImportModal: React.FC<DriverImportModalProps> = ({
  companyId,
  userId,
  platforms,
  onClose,
  onImported,
}) => {
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<DriverImportResult | null>(null);
  const [result, setResult] = useState<BulkImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (!/\.(xlsx|xls)$/i.test(file.name)) {
      toast.error('Envie um arquivo .xlsx ou .xls');
      return;
    }
    if (file.size > MAX_SIZE) {
      toast.error('Arquivo acima de 5 MB');
      return;
    }
    setBusy(true);
    try {
      const data = await parseDriverSpreadsheet(file);
      setParsed(data);
      setStep('preview');
    } catch (e) {
      console.error('Erro ao ler planilha:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao ler planilha');
    } finally {
      setBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleConfirm = async () => {
    if (!parsed || parsed.drivers.length === 0) return;
    setBusy(true);
    try {
      const res = await bulkImportDrivers(companyId, userId, parsed.drivers, platforms);
      setResult(res);
      setStep('result');
      await onImported();
    } catch (e) {
      console.error('Erro ao importar drivers:', e);
      toast.error(e instanceof Error ? e.message : 'Erro ao importar drivers');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell
      icon={<FileSpreadsheet className="w-5 h-5" />}
      title="Importar drivers (Excel)"
      subtitle="Planilha iMile CTGA — cadastra drivers e valores por pacote"
      onClose={onClose}
      maxWidth="sm:max-w-2xl"
      footer={
        step === 'preview' ? (
          <>
            <button
              type="button"
              onClick={() => {
                setParsed(null);
                setStep('upload');
              }}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
            >
              Voltar
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={busy || !parsed || parsed.drivers.length === 0}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm font-medium inline-flex items-center gap-2 min-h-[40px] disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Importar {parsed ? parsed.drivers.length : 0} driver(s)
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 text-sm font-medium min-h-[40px]"
          >
            {step === 'result' ? 'Concluir' : 'Cancelar'}
          </button>
        )
      }
    >
      {step === 'upload' && (
        <div className="space-y-4">
          <div className="bg-blue-50 border border-blue-100 rounded-md p-3 text-sm text-blue-800">
            Selecione a planilha de pagamentos. O sistema lê nome, rota(s), pacotes e valor por pacote de cada driver
            e mostra uma pré-visualização antes de importar.
          </div>
          <label className="flex flex-col items-center justify-center gap-3 border-2 border-dashed border-gray-300 rounded-lg py-10 cursor-pointer hover:border-blue-400 hover:bg-blue-50/40">
            {busy ? <Loader2 className="w-8 h-8 text-blue-600 animate-spin" /> : <Upload className="w-8 h-8 text-gray-400" />}
            <span className="text-sm text-gray-600">Clique para escolher o arquivo (.xlsx / .xls)</span>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>
        </div>
      )}

      {step === 'preview' && parsed && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-md border border-green-100 bg-green-50 p-3 text-center">
              <div className="text-2xl font-bold text-green-700">{parsed.drivers.length}</div>
              <div className="text-xs text-green-800">Prontos</div>
            </div>
            <div className="rounded-md border border-amber-100 bg-amber-50 p-3 text-center">
              <div className="text-2xl font-bold text-amber-700">{parsed.warnings.length}</div>
              <div className="text-xs text-amber-800">Avisos</div>
            </div>
            <div className="rounded-md border border-red-100 bg-red-50 p-3 text-center">
              <div className="text-2xl font-bold text-red-700">{parsed.errors.length}</div>
              <div className="text-xs text-red-800">Erros</div>
            </div>
          </div>

          {parsed.errors.length > 0 && (
            <div className="border border-red-100 bg-red-50 rounded-md p-3 text-sm text-red-800 max-h-28 overflow-y-auto">
              {parsed.errors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )}
          {parsed.warnings.length > 0 && (
            <div className="border border-amber-100 bg-amber-50 rounded-md p-3 text-sm text-amber-800 max-h-28 overflow-y-auto">
              {parsed.warnings.map((warn, i) => (
                <div key={i}>• {warn}</div>
              ))}
            </div>
          )}

          <div className="border border-gray-200 rounded-md overflow-hidden">
            <div className="max-h-72 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Nome</th>
                    <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Rota(s)</th>
                    <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Valores</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {parsed.drivers.map((seed, i) => (
                    <tr key={i}>
                      <td className="px-3 py-2 text-gray-900 break-words">{seed.name}</td>
                      <td className="px-3 py-2 text-gray-600 break-words">{routeLabel(seed)}</td>
                      <td className="px-3 py-2 text-right text-gray-500 whitespace-nowrap">
                        {seed.rates
                          ? Object.entries(seed.rates)
                              .map(([name, rate]) => `${name}: ${rate}`)
                              .join(' · ')
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <p className="text-xs text-gray-500">
            Nada é gravado até você clicar em <b>Importar</b>. Nomes duplicados são pessoas diferentes e não são
            mesclados.
          </p>
        </div>
      )}

      {step === 'result' && result && (
        <div className="space-y-4 text-center py-4">
          <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
          <p className="text-sm text-gray-700">
            <b>{result.driversCreated}</b> driver(s) importado(s) com sucesso.
          </p>
          {result.errors.length > 0 && (
            <div className="text-left border border-red-100 bg-red-50 rounded-md p-3 text-sm text-red-800 max-h-40 overflow-y-auto">
              <div className="flex items-center gap-2 font-medium mb-1">
                <AlertTriangle className="w-4 h-4" /> {result.errors.length} erro(s):
              </div>
              {result.errors.map((err, i) => (
                <div key={i}>• {err}</div>
              ))}
            </div>
          )}
        </div>
      )}
    </ModalShell>
  );
};
