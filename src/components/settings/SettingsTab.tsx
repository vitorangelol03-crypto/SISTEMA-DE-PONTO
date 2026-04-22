import React, { useEffect, useState } from 'react';
import { Settings, Info, Database, Shield, Clock, DollarSign, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import {
  getBonusDefaults,
  updateBonusDefault,
  BonusType,
} from '../../services/database';

interface SettingsTabProps {
  userId: string;
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  hasPermission: (permission: string) => boolean;
}

export const SettingsTab: React.FC<SettingsTabProps> = ({ userId }) => {
  const isAdmin = userId === '9999';

  const [bonusDefaults, setBonusDefaults] = useState<Record<BonusType, string>>({
    B: '',
    C1: '',
    C2: '',
  });
  const [loadingDefaults, setLoadingDefaults] = useState(true);
  const [savingType, setSavingType] = useState<BonusType | null>(null);

  useEffect(() => {
    if (!isAdmin) {
      setLoadingDefaults(false);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const defaults = await getBonusDefaults();
        if (cancelled) return;
        setBonusDefaults({
          B: defaults.B.toFixed(2),
          C1: defaults.C1.toFixed(2),
          C2: defaults.C2.toFixed(2),
        });
      } catch (error) {
        console.error('Erro ao carregar valores padrão de bonificação:', error);
        toast.error('Erro ao carregar valores padrão de bonificação');
      } finally {
        if (!cancelled) setLoadingDefaults(false);
      }
    })();
    return () => { cancelled = true; };
  }, [isAdmin]);

  const handleSaveBonusDefault = async (type: BonusType) => {
    const parsed = parseFloat(bonusDefaults[type]);
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Valor inválido');
      return;
    }
    setSavingType(type);
    try {
      await updateBonusDefault(type, parsed, userId);
      toast.success(`Valor padrão de ${type} atualizado para R$ ${parsed.toFixed(2)}`);
      setBonusDefaults(prev => ({ ...prev, [type]: parsed.toFixed(2) }));
    } catch (error) {
      console.error('Erro ao salvar valor padrão de bonificação:', error);
      toast.error((error as Error).message || 'Erro ao salvar valor padrão');
    } finally {
      setSavingType(null);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <h2 className="text-lg sm:text-xl font-semibold flex items-center mb-6">
          <Settings className="w-5 h-5 mr-2 text-blue-600" />
          Configurações do Sistema
        </h2>

        <div className="space-y-6">
          <div className="border-l-4 border-blue-500 bg-blue-50 p-4">
            <div className="flex items-center">
              <Info className="w-5 h-5 text-blue-600 mr-2" />
              <h3 className="text-lg font-medium text-blue-800">Informações do Sistema</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-blue-700">
              <p><strong>Nome:</strong> Sistema de Controle de Ponto Empresarial</p>
              <p><strong>Versão:</strong> 1.0.0</p>
              <p><strong>Desenvolvido:</strong> 2025</p>
              <p><strong>Banco de Dados:</strong> Supabase PostgreSQL</p>
            </div>
          </div>

          <div className="border-l-4 border-green-500 bg-green-50 p-4">
            <div className="flex items-center">
              <Database className="w-5 h-5 text-green-600 mr-2" />
              <h3 className="text-lg font-medium text-green-800">Status da Conexão</h3>
            </div>
            <div className="mt-3 text-sm text-green-700">
              <p>✅ Conexão com Supabase estabelecida</p>
              <p>✅ Tabelas do sistema configuradas</p>
              <p>✅ Sistema operacional</p>
            </div>
          </div>

          <div className="border-l-4 border-purple-500 bg-purple-50 p-4">
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-purple-600 mr-2" />
              <h3 className="text-lg font-medium text-purple-800">Segurança</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-purple-700">
              <p>🔐 Autenticação por ID e senha</p>
              <p>👤 Controle de permissões por função</p>
              <p>🔄 Sessões persistentes</p>
              <p>✅ Validação de dados</p>
            </div>
          </div>

          <div className="border-l-4 border-orange-500 bg-orange-50 p-4">
            <div className="flex items-center">
              <Clock className="w-5 h-5 text-orange-600 mr-2" />
              <h3 className="text-lg font-medium text-orange-800">Funcionamento</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-orange-700">
              <p>📅 Sistema reseta pontos diariamente às 00:00</p>
              <p>📊 Histórico completo preservado</p>
              <p>🔄 Atualizações em tempo real</p>
              <p>📤 Exportação de relatórios em Excel</p>
            </div>
          </div>
        </div>
      </div>

      {isAdmin && (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
          <h3 className="text-base sm:text-lg font-semibold flex items-center mb-2 text-gray-800">
            <DollarSign className="w-5 h-5 mr-2 text-emerald-600" />
            Valores Padrão de Bonificação
          </h3>
          <p className="text-sm text-gray-600 mb-4">
            Esses valores são sugeridos automaticamente ao abrir o modal de Bonificação
            na aba Ponto. O supervisor ainda pode alterá-los antes de aplicar.
          </p>

          {loadingDefaults ? (
            <p className="text-sm text-gray-500">Carregando valores atuais...</p>
          ) : (
            <div className="space-y-4 max-w-md">
              {(['B', 'C1', 'C2'] as BonusType[]).map(type => {
                const saving = savingType === type;
                return (
                  <div key={type} className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
                    <label className="w-full sm:w-20 text-sm font-medium text-gray-700">
                      Tipo {type}
                    </label>
                    <div className="flex items-center gap-2 flex-1">
                      <span className="text-sm text-gray-500">R$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={bonusDefaults[type]}
                        onChange={(e) =>
                          setBonusDefaults(prev => ({ ...prev, [type]: e.target.value }))
                        }
                        disabled={saving}
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-emerald-500 focus:border-emerald-500 text-base min-h-[44px]"
                        placeholder="0.00"
                      />
                      <button
                        onClick={() => handleSaveBonusDefault(type)}
                        disabled={saving}
                        className="flex items-center justify-center gap-1 px-4 py-2 bg-emerald-600 text-white rounded-md hover:bg-emerald-700 disabled:opacity-50 transition-colors font-medium min-h-[44px] whitespace-nowrap"
                      >
                        <Save className="w-4 h-4" />
                        {saving ? 'Salvando...' : 'Salvar'}
                      </button>
                    </div>
                  </div>
                );
              })}

              <p className="text-xs text-gray-500 pt-2">
                Visível apenas para o administrador (ID 9999).
              </p>
            </div>
          )}
        </div>
      )}

      <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
        <h3 className="text-base sm:text-lg font-semibold mb-4 text-gray-800">Instruções de Uso</h3>

        <div className="space-y-4 text-sm text-gray-600">
          <div>
            <h4 className="font-medium text-gray-800 mb-2">👨‍💼 Administradores (ID: 9999)</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Acesso completo ao sistema</li>
              <li>Podem criar e gerenciar supervisores</li>
              <li>Visualizam todas as funcionalidades</li>
              <li>Usuário padrão: ID 9999, Senha: 684171</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-800 mb-2">👥 Supervisores</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Gerenciam funcionários e ponto</li>
              <li>Acessam relatórios e configurações</li>
              <li>Não podem criar outros usuários</li>
              <li>Criados pelo administrador</li>
            </ul>
          </div>

          <div>
            <h4 className="font-medium text-gray-800 mb-2">📝 Funcionalidades Principais</h4>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Cadastro completo de funcionários com validação de CPF</li>
              <li>Marcação diária de ponto (presente/falta)</li>
              <li>Controle de horário de saída</li>
              <li>Relatórios com filtros avançados</li>
              <li>Exportação para Excel</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};
