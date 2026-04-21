import React, { useState } from 'react';
import { AlertTriangle, LogOut, Loader2, Eye, EyeOff, XCircle } from 'lucide-react';
import toast from 'react-hot-toast';
import { getEmployeeByCpf, verifyEmployeePin, Employee } from '../../services/database';
import { EmployeeErrorsView } from './EmployeeErrorsView';

function formatCPFMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

type Step = 'cpf' | 'pin' | 'dashboard' | 'error';

export const EmployeeErrorsPage: React.FC = () => {
  const [step, setStep] = useState<Step>('cpf');
  const [cpfInput, setCpfInput] = useState('');
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);
  const [employee, setEmployee] = useState<Employee | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const cpfDigits = cpfInput.replace(/\D/g, '');
  const cpfValid = cpfDigits.length === 11;

  const handleCpfSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cpfValid) return;
    setLoading(true);
    try {
      const emp = await getEmployeeByCpf(cpfDigits);
      if (!emp) {
        setErrorMsg('Funcionário não encontrado. Verifique o CPF.');
        setStep('error');
        return;
      }
      if (!emp.pin_configured) {
        setErrorMsg('PIN não configurado. Acesse "Registrar Ponto" no terminal do trabalho primeiro para configurar seu PIN.');
        setStep('error');
        return;
      }
      setEmployee(emp);
      setStep('pin');
    } catch (err) {
      console.error(err);
      setErrorMsg('Erro ao verificar CPF. Tente novamente.');
      setStep('error');
    } finally {
      setLoading(false);
    }
  };

  const handlePinSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employee || pin.length < 4) return;
    setLoading(true);
    try {
      const valid = await verifyEmployeePin(employee.id, pin);
      if (!valid) {
        toast.error('PIN incorreto');
        setPin('');
        return;
      }
      setStep('dashboard');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao verificar PIN');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    setEmployee(null);
    setPin('');
    setCpfInput('');
    setStep('cpf');
  };

  const goBackToCpf = () => {
    setEmployee(null);
    setPin('');
    setStep('cpf');
  };

  // ── DASHBOARD ────────────────────────────────────────────────────────────
  if (step === 'dashboard' && employee) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="bg-orange-600 text-white px-5 py-4 flex items-center justify-between shadow">
          <div>
            <p className="text-xs text-orange-200">Olá,</p>
            <p className="font-bold text-lg leading-tight">{employee.name.split(' ')[0]}</p>
            <p className="text-xs text-orange-200 flex items-center gap-1 mt-0.5">
              <AlertTriangle className="w-3 h-3" />
              Meus Erros
            </p>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-1 px-3 py-2 bg-white bg-opacity-20 rounded-lg hover:bg-opacity-30 transition-colors text-sm"
          >
            <LogOut className="w-4 h-4" />
            Sair
          </button>
        </div>

        <div className="max-w-2xl mx-auto">
          <EmployeeErrorsView employeeId={employee.id} />
        </div>
      </div>
    );
  }

  // ── ERROR ────────────────────────────────────────────────────────────────
  if (step === 'error') {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-lg p-6 text-center space-y-4">
          <XCircle className="w-16 h-16 text-red-500 mx-auto" />
          <p className="text-gray-700">{errorMsg}</p>
          <button
            onClick={goBackToCpf}
            className="w-full py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 transition-colors"
          >
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  // ── LOGIN (CPF ou PIN) ──────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-2xl shadow-lg overflow-hidden">
        <div className="bg-orange-600 px-6 py-5 text-white text-center">
          <AlertTriangle className="w-10 h-10 mx-auto mb-2" />
          <h1 className="text-xl font-bold">Meus Erros</h1>
          <p className="text-sm text-orange-100 mt-1">Consulte seus erros por período de pagamento</p>
        </div>

        {step === 'cpf' && (
          <form onSubmit={handleCpfSubmit} className="p-6 space-y-4">
            <div>
              <label htmlFor="cpf" className="block text-sm font-medium text-gray-700 mb-1">
                CPF
              </label>
              <input
                id="cpf"
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cpfInput}
                onChange={e => setCpfInput(formatCPFMask(e.target.value))}
                placeholder="000.000.000-00"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-lg font-mono text-center"
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={!cpfValid || loading}
              className="w-full py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
            >
              {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> Verificando...</> : 'Continuar'}
            </button>
          </form>
        )}

        {step === 'pin' && employee && (
          <form onSubmit={handlePinSubmit} className="p-6 space-y-4">
            <p className="text-sm text-gray-600 text-center">
              Olá, <strong>{employee.name.split(' ')[0]}</strong>! Digite seu PIN.
            </p>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                inputMode="numeric"
                autoComplete="off"
                value={pin}
                onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••"
                className="w-full px-4 py-3 pr-10 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 text-2xl font-mono text-center tracking-widest"
                required
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPin(s => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
              >
                {showPin ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={goBackToCpf}
                className="flex-1 py-3 border border-gray-300 text-gray-700 font-medium rounded-xl hover:bg-gray-50"
              >
                Voltar
              </button>
              <button
                type="submit"
                disabled={pin.length < 4 || loading}
                className="flex-1 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 disabled:bg-gray-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {loading ? <><Loader2 className="w-5 h-5 animate-spin" /> ...</> : 'Entrar'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
