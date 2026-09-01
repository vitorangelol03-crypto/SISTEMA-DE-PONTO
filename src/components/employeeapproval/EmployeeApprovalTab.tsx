import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserCheck, Copy, CheckCircle2, XCircle, Clock3, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import { getAllEmployees, updateEmployeeRegistrationStatus, Employee } from '../../services/database';
import { useCompany } from '../../contexts/useCompany';
import {
  formatCPF,
  formatPhoneDisplay,
  sanitizePublicRegistrationName,
  sanitizePublicRegistrationPixKey,
  sanitizePhoneDigits,
} from '../../utils/validation';

// Sub-fase 26/08 — aba "Aprovação de Cadastro". Todo funcionário (os que já
// existiam antes da migration E os novos, cadastrados pelo link público)
// entra como 'pending'. pending/approved batem ponto normal; só 'rejected'
// bloqueia (checado em EmployeeClockIn).

interface EmployeeApprovalTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

type StatusFilter = 'pending' | 'approved' | 'rejected';

const STATUS_META: Record<StatusFilter, { label: string; icon: React.ElementType; badgeCls: string }> = {
  pending: { label: 'Pendente', icon: Clock3, badgeCls: 'bg-yellow-100 text-yellow-800' },
  approved: { label: 'Aprovado', icon: CheckCircle2, badgeCls: 'bg-green-100 text-green-800' },
  rejected: { label: 'Recusado', icon: XCircle, badgeCls: 'bg-red-100 text-red-800' },
};

function formatDateTimeBR(iso: string | null | undefined): string {
  if (!iso) return '-';
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/**
 * Botão de copiar ao lado de um dado (nome/CPF/telefone/PIX). Pedido do
 * Victor (26/08, ao ver o print da aba): copia sempre a versão LIMPA — sem
 * acento, ponto ou traço — mesmo pra funcionário antigo cadastrado com
 * acento no nome (o cadastro público já sanitiza; este botão sanitiza de
 * novo por garantia, então funciona pros dois casos).
 */
const CopyField: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const handleCopy = async () => {
    if (!value) return;
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copiado`);
    } catch {
      toast.error('Não foi possível copiar');
    }
  };
  return (
    <button
      type="button"
      onClick={handleCopy}
      disabled={!value}
      title={`Copiar ${label.toLowerCase()}`}
      className="inline-flex items-center justify-center p-1 rounded text-gray-400 hover:text-green-700 hover:bg-green-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
    >
      <Copy className="w-3.5 h-3.5" />
    </button>
  );
};

export const EmployeeApprovalTab: React.FC<EmployeeApprovalTabProps> = ({ userId, hasPermission }) => {
  const { company } = useCompany();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [notesDraft, setNotesDraft] = useState<Record<string, string>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);

  const canApprove = hasPermission('employeeapproval.approve');
  const canReject = hasPermission('employeeapproval.reject');

  const registerLink = company
    ? `${window.location.origin}/cadastro?empresa=${company.id}`
    : '';

  const loadEmployees = useCallback(async () => {
    if (!company?.id) return;
    setLoading(true);
    try {
      const data = await getAllEmployees(undefined, company.id);
      setEmployees(data);
    } catch {
      toast.error('Erro ao carregar funcionários');
    } finally {
      setLoading(false);
    }
  }, [company?.id]);

  useEffect(() => { loadEmployees(); }, [loadEmployees]);

  const counts = useMemo(() => {
    const c: Record<StatusFilter, number> = { pending: 0, approved: 0, rejected: 0 };
    for (const e of employees) {
      const status = (e.registration_status ?? 'pending') as StatusFilter;
      if (status in c) c[status] += 1;
    }
    return c;
  }, [employees]);

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return employees
      .filter(e => (e.registration_status ?? 'pending') === filter)
      .filter(e => !term || e.name.toLowerCase().includes(term) || (e.cpf ?? '').includes(term.replace(/\D/g, '')))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [employees, filter, searchTerm]);

  const handleCopyLink = async () => {
    if (!registerLink) return;
    try {
      await navigator.clipboard.writeText(registerLink);
      setLinkCopied(true);
      toast.success('Link copiado');
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      toast.error('Não foi possível copiar o link. Copie manualmente.');
    }
  };

  const handleDecision = async (employee: Employee, status: 'approved' | 'rejected') => {
    const currentStatus = employee.registration_status ?? 'pending';
    if (status === 'rejected') {
      const confirmed = window.confirm(
        `Recusar o cadastro de ${employee.name}? Isso bloqueia o funcionário no próximo ponto.`
      );
      if (!confirmed) return;
    } else if (currentStatus === 'rejected') {
      const confirmed = window.confirm(
        `Reverter o bloqueio de ${employee.name} e aprovar de novo? Ele volta a poder bater ponto.`
      );
      if (!confirmed) return;
    }
    setSavingId(employee.id);
    try {
      const notes = notesDraft[employee.id] ?? employee.registration_notes ?? '';
      await updateEmployeeRegistrationStatus(employee.id, status, notes || null, userId);
      toast.success(status === 'approved' ? 'Cadastro aprovado' : 'Cadastro recusado');
      await loadEmployees();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Erro ao salvar');
    } finally {
      setSavingId(null);
    }
  };

  if (!company) {
    return <div className="p-8 text-center text-gray-500">Carregando empresa...</div>;
  }

  return (
    <div className="p-4 md:p-6 space-y-6">
      <div className="flex items-center gap-3">
        <UserCheck className="w-7 h-7 text-green-600" />
        <div>
          <h2 className="text-xl font-bold text-gray-900">Aprovação de Cadastro</h2>
          <p className="text-sm text-gray-500">Análise de antecedentes dos funcionários — {company.display_name}</p>
        </div>
      </div>

      {/* Link público de cadastro */}
      <div className="bg-green-50 border-2 border-green-200 rounded-xl p-4 space-y-2">
        <p className="text-sm font-semibold text-green-900">Link de cadastro para novos funcionários</p>
        <p className="text-xs text-green-700">
          Compartilhe esse link com o candidato — ele cadastra sozinho, sem entrar no sistema, e já pode bater ponto.
        </p>
        <div className="flex items-center gap-2">
          <input
            type="text"
            readOnly
            value={registerLink}
            className="flex-1 min-w-0 px-3 py-2 bg-white border border-green-300 rounded-lg text-sm font-mono text-gray-700"
            onFocus={e => e.target.select()}
          />
          <button
            onClick={handleCopyLink}
            className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 transition-colors"
          >
            <Copy className="w-4 h-4" />
            {linkCopied ? 'Copiado!' : 'Copiar'}
          </button>
        </div>
      </div>

      {/* Filtro por status */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(STATUS_META) as StatusFilter[]).map(key => {
          const meta = STATUS_META[key];
          const Icon = meta.icon;
          const active = filter === key;
          return (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors ${
                active ? 'bg-green-600 border-green-600 text-white' : 'bg-white border-gray-200 text-gray-600 hover:border-green-300'
              }`}
            >
              <Icon className="w-4 h-4" />
              {meta.label}
              <span className={`px-1.5 py-0.5 rounded-full text-xs ${active ? 'bg-white/20' : 'bg-gray-100'}`}>
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      {/* Busca */}
      <div className="relative max-w-sm">
        <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input
          type="text"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Buscar por nome ou CPF..."
          className="w-full pl-9 pr-3 py-2 border-2 border-gray-200 rounded-lg text-sm focus:border-green-500 focus:outline-none"
        />
      </div>

      {/* Lista */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Carregando...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-8 text-gray-400">Nenhum funcionário nesse filtro.</div>
      ) : (
        <div className="space-y-3">
          {filtered.map(emp => (
            <div key={emp.id} data-testid="employee-approval-row" className="bg-white border-2 border-gray-100 rounded-xl p-4 space-y-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="space-y-1">
                  <p className="font-semibold text-gray-900 flex items-center gap-1">
                    {emp.name}
                    <CopyField label="Nome" value={sanitizePublicRegistrationName(emp.name)} />
                  </p>
                  <p className="text-xs text-gray-500 flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="inline-flex items-center gap-1">
                      CPF: {formatCPF(emp.cpf) || '-'}
                      <CopyField label="CPF" value={emp.cpf ? emp.cpf.replace(/\D/g, '') : ''} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      Tel: {formatPhoneDisplay(emp.phone) || '-'}
                      <CopyField label="Telefone" value={emp.phone ? sanitizePhoneDigits(emp.phone) : ''} />
                    </span>
                    <span className="inline-flex items-center gap-1">
                      PIX ({emp.pix_type ?? '-'}): {emp.pix_key ?? '-'}
                      <CopyField label="Chave PIX" value={emp.pix_key ? sanitizePublicRegistrationPixKey(emp.pix_key) : ''} />
                    </span>
                  </p>
                  {(emp.employment_type || emp.function_role) && (
                    <p className="text-xs text-gray-500">
                      {[emp.employment_type, emp.function_role].filter(Boolean).join(' — ')}
                    </p>
                  )}
                </div>
                <span className={`px-2 py-1 rounded-full text-xs font-semibold ${STATUS_META[(emp.registration_status ?? 'pending') as StatusFilter].badgeCls}`}>
                  {STATUS_META[(emp.registration_status ?? 'pending') as StatusFilter].label}
                </span>
              </div>

              {emp.registration_reviewed_at && (
                <p className="text-xs text-gray-400">Analisado em {formatDateTimeBR(emp.registration_reviewed_at)}</p>
              )}

              <textarea
                value={notesDraft[emp.id] ?? emp.registration_notes ?? ''}
                onChange={e => setNotesDraft(prev => ({ ...prev, [emp.id]: e.target.value }))}
                placeholder="Observações sobre a análise..."
                rows={2}
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:border-green-500 focus:outline-none resize-none"
              />

              {/* Botões nos 3 filtros (31/08): decisão de aprovar/recusar não é
                  definitiva — dá pra reverter depois em qualquer direção
                  (ex.: aprovado que some do trabalho vira recusado; recusado
                  por engano volta a aprovado, desbloqueando o ponto). */}
              <div className="flex gap-2">
                {filter !== 'approved' && (
                  <button
                    onClick={() => handleDecision(emp, 'approved')}
                    disabled={!canApprove || savingId === emp.id}
                    className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {filter === 'rejected' ? 'Reverter e aprovar' : 'Aprovar'}
                  </button>
                )}
                {filter !== 'rejected' && (
                  <button
                    onClick={() => handleDecision(emp, 'rejected')}
                    disabled={!canReject || savingId === emp.id}
                    className="flex-1 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    Recusar
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
