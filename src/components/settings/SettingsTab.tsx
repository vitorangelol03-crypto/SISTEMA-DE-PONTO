import React from 'react';
import { Settings, Info, Database, Shield, Clock } from 'lucide-react';

export const SettingsTab: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <h2 className="text-xl font-semibold flex items-center mb-6">
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

          <div className="border-l-4 border-slate-500 bg-slate-50 p-4">
            <div className="flex items-center">
              <Shield className="w-5 h-5 text-slate-600 mr-2" />
              <h3 className="text-lg font-medium text-slate-800">Segurança</h3>
            </div>
            <div className="mt-3 space-y-2 text-sm text-slate-700">
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

      <div className="bg-white p-6 rounded-lg shadow">
        <h3 className="text-lg font-semibold mb-4 text-gray-800">Instruções de Uso</h3>
        
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