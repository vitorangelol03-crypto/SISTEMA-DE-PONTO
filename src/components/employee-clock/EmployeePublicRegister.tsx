import React, { useState, useEffect } from 'react';
import { UserPlus, CheckCircle2, XCircle, Loader2 } from 'lucide-react';
import { getCompanyById, registerEmployeePublic, Company } from '../../services/database';
import {
  validateCPF,
  sanitizePublicRegistrationName,
  sanitizePublicRegistrationPixKey,
  sanitizePhoneDigits,
  validatePhoneDigits,
  formatPhoneDisplay,
} from '../../utils/validation';

// Sub-fase 26/08 — cadastro público de funcionário (link sem login, sem
// entrar no sistema). Empresa vem fixa na URL (?empresa=<company_id>),
// gerada pela aba "Aprovação de Cadastro" do painel — o candidato nunca
// escolhe empresa. Grava com registration_status='pending' (já bate ponto
// normal; a análise de antecedentes acontece depois, no painel).

function formatCPFMask(value: string): string {
  const d = value.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

const PIX_TYPES = ['CPF', 'Email', 'Telefone', 'Aleatória'] as const;

type Step = 'loading' | 'link-invalid' | 'form' | 'success' | 'submit-error';

export const EmployeePublicRegister: React.FC = () => {
  const [step, setStep] = useState<Step>('loading');
  const [company, setCompany] = useState<Company | null>(null);

  const [name, setName] = useState('');
  const [cpfInput, setCpfInput] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [pixKey, setPixKey] = useState('');
  const [pixType, setPixType] = useState<typeof PIX_TYPES[number] | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');

  const companyId = new URLSearchParams(window.location.search).get('empresa') ?? '';

  useEffect(() => {
    let active = true;
    if (!companyId) {
      setStep('link-invalid');
      return;
    }
    getCompanyById(companyId)
      .then(c => {
        if (!active) return;
        if (!c) {
          setStep('link-invalid');
          return;
        }
        setCompany(c);
        setStep('form');
      })
      .catch(() => {
        if (active) setStep('link-invalid');
      });
    return () => { active = false; };
  }, [companyId]);

  const cpfDigits = cpfInput.replace(/\D/g, '');
  const phoneDigits = phoneInput.replace(/\D/g, '');
  const nameValid = sanitizePublicRegistrationName(name).length >= 3;
  const cpfValid = validateCPF(cpfDigits);
  const phoneValid = validatePhoneDigits(phoneDigits);
  const pixKeyValid = sanitizePublicRegistrationPixKey(pixKey).length > 0;
  const formValid = nameValid && cpfValid && phoneValid && pixKeyValid && !!pixType;

  const handleSubmit = async () => {
    if (!formValid || !company) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      await registerEmployeePublic({
        companyId: company.id,
        name: sanitizePublicRegistrationName(name),
        cpf: cpfDigits,
        phone: phoneDigits,
        pixKey: sanitizePublicRegistrationPixKey(pixKey),
        pixType,
      });
      setStep('success');
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Erro ao enviar cadastro. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  const Header = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="bg-green-600 px-6 py-5 text-white text-center">
      <UserPlus className="w-10 h-10 mx-auto mb-2 opacity-90" />
      <h1 className="text-xl font-bold">{title}</h1>
      {subtitle && <p className="text-green-100 text-sm mt-1">{subtitle}</p>}
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-600 to-green-800 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden">

        {step === 'loading' && (
          <div className="p-10 text-center">
            <Loader2 className="w-8 h-8 animate-spin text-green-600 mx-auto" />
          </div>
        )}

        {step === 'link-invalid' && (
          <>
            <Header title="Link inválido" />
            <div className="p-6 text-center space-y-3">
              <XCircle className="w-16 h-16 text-red-500 mx-auto" />
              <p className="text-gray-600">
                Esse link de cadastro não é válido. Peça um link novo pra quem te chamou.
              </p>
            </div>
          </>
        )}

        {step === 'form' && (
          <>
            <Header title="Cadastro de Funcionário" subtitle={company?.display_name} />
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Nome completo</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(sanitizePublicRegistrationName(e.target.value))}
                  placeholder="Seu nome completo"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">CPF</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={cpfInput}
                  onChange={e => setCpfInput(formatCPFMask(e.target.value))}
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none font-mono"
                />
                {cpfDigits.length === 11 && !cpfValid && (
                  <p className="text-xs text-red-500 mt-1">CPF inválido</p>
                )}
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Telefone</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={formatPhoneDisplay(sanitizePhoneDigits(phoneInput))}
                  onChange={e => setPhoneInput(sanitizePhoneDigits(e.target.value))}
                  placeholder="(00) 00000-0000"
                  maxLength={15}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Tipo da chave PIX</label>
                <select
                  value={pixType}
                  onChange={e => setPixType(e.target.value as typeof PIX_TYPES[number])}
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none bg-white"
                >
                  <option value="">Selecione...</option>
                  {PIX_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Chave PIX</label>
                <input
                  type="text"
                  value={pixKey}
                  onChange={e => setPixKey(sanitizePublicRegistrationPixKey(e.target.value))}
                  placeholder="Sua chave PIX"
                  className="w-full px-4 py-3 border-2 border-gray-300 rounded-xl focus:border-green-500 focus:outline-none"
                />
              </div>

              {submitError && (
                <p className="text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">{submitError}</p>
              )}

              <button
                onClick={handleSubmit}
                disabled={!formValid || submitting}
                className="w-full py-4 bg-green-600 text-white text-lg font-bold rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Enviar cadastro'}
              </button>
            </div>
          </>
        )}

        {step === 'success' && (
          <>
            <Header title="Cadastro enviado!" />
            <div className="p-6 text-center space-y-4">
              <CheckCircle2 className="w-16 h-16 text-green-600 mx-auto" />
              <p className="text-gray-700 font-semibold">Você já pode bater ponto normalmente.</p>
              <p className="text-gray-500 text-sm">
                Seu cadastro vai passar por uma análise. Se precisar de algo, procure seu supervisor ou o RH.
              </p>
            </div>
          </>
        )}

      </div>
    </div>
  );
};
