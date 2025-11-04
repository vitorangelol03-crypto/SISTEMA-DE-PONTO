import React, { useState, useEffect } from 'react';
import { UserCog, Plus, Trash2, Eye, EyeOff, RefreshCw, Shield } from 'lucide-react';
import { getAllUsers, createUser, deleteUser, User } from '../../services/database';
import { isValidPassword, isNumericString } from '../../utils/validation';
import { getUserPermissions } from '../../services/permissions';
import { UserPermissions } from '../../types/permissions';
import { PermissionsModal } from '../permissions/PermissionsModal';
import toast from 'react-hot-toast';

interface UsersTabProps {
  userId: string;
  hasPermission: (permission: string) => boolean;
}

export const UsersTab: React.FC<UsersTabProps> = ({ userId, hasPermission }) => {
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showPermissionsModal, setShowPermissionsModal] = useState(false);
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [userPermissions, setUserPermissions] = useState<UserPermissions | null>(null);
  const [formData, setFormData] = useState({
    id: '',
    password: '',
    confirmPassword: ''
  });

  const loadUsers = async () => {
    try {
      setLoading(true);
      const data = await getAllUsers();
      setUsers(data);
    } catch (error) {
      console.error('Erro ao carregar usuários:', error);
      toast.error('Erro ao carregar usuários');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const resetForm = () => {
    setFormData({ id: '', password: '', confirmPassword: '' });
    setShowForm(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasPermission('users.create')) {
      toast.error('Você não tem permissão para criar supervisores');
      return;
    }

    if (!formData.id.trim() || !isNumericString(formData.id.trim())) {
      toast.error('ID deve conter apenas números');
      return;
    }

    if (!isValidPassword(formData.password)) {
      toast.error('Senha deve ter pelo menos 6 caracteres');
      return;
    }

    if (formData.password !== formData.confirmPassword) {
      toast.error('Senhas não coincidem');
      return;
    }

    try {
      await createUser(formData.id.trim(), formData.password, 'supervisor', userId);
      toast.success('Supervisor criado com sucesso!');
      resetForm();
      loadUsers();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Erro ao criar supervisor';
      toast.error(errorMessage);
    }
  };

  const handleDelete = async (user: User) => {
    if (!hasPermission('users.delete')) {
      toast.error('Você não tem permissão para excluir supervisores');
      return;
    }

    if (user.id === '9999') {
      toast.error('Não é possível excluir o administrador principal');
      return;
    }

    if (!confirm(`Tem certeza que deseja excluir o supervisor ID: ${user.id}?`)) {
      return;
    }

    try {
      await deleteUser(user.id);
      toast.success('Supervisor excluído com sucesso!');
      loadUsers();
    } catch (error) {
      console.error('Erro ao excluir supervisor:', error);
      toast.error('Erro ao excluir supervisor');
    }
  };

  const handleManagePermissions = async (user: User) => {
    if (!hasPermission('users.managePermissions')) {
      toast.error('Você não tem permissão para gerenciar permissões');
      return;
    }

    try {
      const permissions = await getUserPermissions(user.id);
      setSelectedUser(user);
      setUserPermissions(permissions);
      setShowPermissionsModal(true);
    } catch (error) {
      console.error('Erro ao carregar permissões:', error);
      toast.error('Erro ao carregar permissões');
    }
  };

  const handlePermissionsSaved = () => {
    toast.success('Permissões atualizadas com sucesso!');
    setShowPermissionsModal(false);
    setSelectedUser(null);
    setUserPermissions(null);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-blue-600" />
        <span className="ml-2">Carregando...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white p-6 rounded-lg shadow">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h2 className="text-xl font-semibold flex items-center">
            <UserCog className="w-5 h-5 mr-2 text-blue-600" />
            Gestão de Usuários ({users.length})
          </h2>
          
          <button
            onClick={() => setShowForm(true)}
            disabled={!hasPermission('users.create')}
            title={!hasPermission('users.create') ? 'Você não tem permissão para criar supervisores' : ''}
            className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-300 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Plus className="w-4 h-4" />
            <span>Criar Supervisor</span>
          </button>
        </div>
      </div>

      {showForm && (
        <div className="bg-white p-6 rounded-lg shadow">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium">Criar Novo Supervisor</h3>
            <button
              onClick={resetForm}
              className="text-gray-400 hover:text-gray-600"
            >
              ✕
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID do Usuário *
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="\d*"
                  value={formData.id}
                  onChange={(e) => {
                    const value = e.target.value.replace(/\D/g, '');
                    setFormData(prev => ({ ...prev, id: value }));
                  }}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Digite apenas números (ex: 1001)"
                  required
                />
                <p className="text-xs text-gray-500 mt-1">
                  Use apenas números. Ex: 1001, 1002, etc.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Senha *
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={formData.password}
                    onChange={(e) => setFormData(prev => ({ ...prev, password: e.target.value }))}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Digite uma senha segura"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  Mínimo de 6 caracteres
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Confirmar Senha *
                </label>
                <div className="relative">
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Confirme a senha"
                    required
                  />
                  <button
                    type="button"
                    className="absolute inset-y-0 right-0 pr-3 flex items-center"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4 text-gray-400" />
                    ) : (
                      <Eye className="h-4 w-4 text-gray-400" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex space-x-3 pt-4">
              <button
                type="submit"
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
              >
                Criar Supervisor
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </form>
        </div>
      )}

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  ID
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Tipo
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Criado em
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Criado por
                </th>
                <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{user.id}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                      user.role === 'admin' 
                        ? 'bg-blue-100 text-blue-800' 
                        : 'bg-green-100 text-green-800'
                    }`}>
                      {user.role === 'admin' ? 'Administrador' : 'Supervisor'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {user.id === '9999' 
                        ? 'Sistema' 
                        : new Date(user.created_at).toLocaleDateString('pt-BR')
                      }
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">
                      {user.created_by || 'Sistema'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-center text-sm font-medium">
                    <div className="flex items-center justify-center gap-2">
                      {hasPermission('users.managePermissions') && (
                        <button
                          onClick={() => handleManagePermissions(user)}
                          className="p-2 text-blue-600 hover:bg-blue-50 rounded-md transition-colors"
                          title="Gerenciar Permissões"
                        >
                          <Shield className="w-4 h-4" />
                        </button>
                      )}
                      {hasPermission('users.delete') && user.id !== '9999' && (
                        <button
                          onClick={() => handleDelete(user)}
                          className="p-2 text-red-600 hover:bg-red-50 rounded-md transition-colors"
                          title="Excluir Supervisor"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {users.length === 0 && (
          <div className="text-center py-8">
            <UserCog className="w-12 h-12 mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">Nenhum usuário encontrado</h3>
            <p className="text-gray-500">Clique em "Criar Supervisor" para adicionar supervisores.</p>
          </div>
        )}
      </div>

      {showPermissionsModal && selectedUser && (
        <PermissionsModal
          isOpen={showPermissionsModal}
          onClose={() => {
            setShowPermissionsModal(false);
            setSelectedUser(null);
            setUserPermissions(null);
          }}
          userId={selectedUser.id}
          userName={`${selectedUser.role === 'admin' ? 'Admin' : 'Supervisor'} - ID: ${selectedUser.id}`}
          currentPermissions={userPermissions}
          currentUserId={userId}
          onSaved={handlePermissionsSaved}
        />
      )}
    </div>
  );
};