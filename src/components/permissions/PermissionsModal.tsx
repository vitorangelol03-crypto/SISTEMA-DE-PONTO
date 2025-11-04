import { useState, useEffect } from 'react';
import { X, Save, RotateCcw, Search, Shield, Eye, CheckSquare, Square } from 'lucide-react';
import { UserPermissions, PERMISSION_LABELS, DEFAULT_ADMIN_PERMISSIONS, DEFAULT_SUPERVISOR_PERMISSIONS, DEFAULT_READONLY_PERMISSIONS } from '../../types/permissions';
import { saveUserPermissions } from '../../services/permissions';
import toast from 'react-hot-toast';

interface PermissionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  userName: string;
  currentPermissions: UserPermissions | null;
  currentUserId: string;
  onSaved: () => void;
}

export function PermissionsModal({
  isOpen,
  onClose,
  userId,
  userName,
  currentPermissions,
  currentUserId,
  onSaved
}: PermissionsModalProps) {
  const [permissions, setPermissions] = useState<UserPermissions>(
    currentPermissions || DEFAULT_READONLY_PERMISSIONS
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (currentPermissions) {
      setPermissions(currentPermissions);
    } else {
      setPermissions(DEFAULT_READONLY_PERMISSIONS);
    }
  }, [currentPermissions, userId]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (userId === '9999') {
      toast.error('Não é possível alterar permissões do administrador principal');
      return;
    }

    setSaving(true);
    try {
      const result = await saveUserPermissions(userId, permissions, currentUserId);

      if (result.success) {
        toast.success('Permissões salvas com sucesso!');
        onSaved();
        onClose();
      } else {
        toast.error(result.error || 'Erro ao salvar permissões');
      }
    } catch (error) {
      toast.error('Erro ao salvar permissões');
      console.error(error);
    } finally {
      setSaving(false);
    }
  };

  const applyTemplate = (template: UserPermissions) => {
    setPermissions(template);
    toast.success('Template aplicado!');
  };

  const toggleSection = (section: keyof UserPermissions) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const toggleAllInSection = (section: keyof UserPermissions, value: boolean) => {
    setPermissions(prev => {
      const sectionPerms = prev[section];
      const updated = { ...sectionPerms };

      Object.keys(updated).forEach(key => {
        updated[key as keyof typeof updated] = value;
      });

      return {
        ...prev,
        [section]: updated
      };
    });
  };

  const togglePermission = (section: keyof UserPermissions, permission: string) => {
    setPermissions(prev => ({
      ...prev,
      [section]: {
        ...prev[section],
        [permission]: !prev[section][permission as keyof typeof prev[typeof section]]
      }
    }));
  };

  const getActiveCount = (section: keyof UserPermissions): number => {
    const sectionPerms = permissions[section];
    return Object.values(sectionPerms).filter(v => v === true).length;
  };

  const getTotalCount = (section: keyof UserPermissions): number => {
    return Object.keys(permissions[section]).length;
  };

  const filteredSections = Object.keys(permissions).filter(section => {
    if (!searchTerm) return true;

    const sectionLabel = PERMISSION_LABELS[section as keyof typeof PERMISSION_LABELS];
    const sectionTitle = sectionLabel.title.toLowerCase();

    if (sectionTitle.includes(searchTerm.toLowerCase())) return true;

    return Object.keys(permissions[section as keyof UserPermissions]).some(perm => {
      const permLabel = sectionLabel[perm as keyof typeof sectionLabel];
      return permLabel && String(permLabel).toLowerCase().includes(searchTerm.toLowerCase());
    });
  });

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <Shield className="w-6 h-6 text-blue-600" />
              <div>
                <h2 className="text-xl font-bold text-gray-900">Gerenciar Permissões</h2>
                <p className="text-sm text-gray-600">{userName}</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => applyTemplate(DEFAULT_ADMIN_PERMISSIONS)}
              className="px-3 py-1.5 bg-green-100 text-green-700 rounded-lg hover:bg-green-200 transition-colors text-sm font-medium"
            >
              Acesso Total
            </button>
            <button
              onClick={() => applyTemplate(DEFAULT_SUPERVISOR_PERMISSIONS)}
              className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm font-medium"
            >
              Supervisor
            </button>
            <button
              onClick={() => applyTemplate(DEFAULT_READONLY_PERMISSIONS)}
              className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors text-sm font-medium"
            >
              Apenas Visualização
            </button>
            <button
              onClick={() => setPermissions(currentPermissions || DEFAULT_READONLY_PERMISSIONS)}
              className="px-3 py-1.5 bg-orange-100 text-orange-700 rounded-lg hover:bg-orange-200 transition-colors text-sm font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-4 h-4" />
              Resetar
            </button>
          </div>

          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar permissões..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="space-y-3">
            {filteredSections.map(section => {
              const sectionKey = section as keyof UserPermissions;
              const labels = PERMISSION_LABELS[sectionKey];
              const isExpanded = expandedSections.has(section);
              const activeCount = getActiveCount(sectionKey);
              const totalCount = getTotalCount(sectionKey);
              const allActive = activeCount === totalCount;

              return (
                <div key={section} className="border border-gray-200 rounded-lg overflow-hidden">
                  <div className="bg-gray-50 p-4 flex items-center justify-between">
                    <button
                      onClick={() => toggleSection(sectionKey)}
                      className="flex-1 flex items-center gap-3 text-left"
                    >
                      <div className="flex items-center gap-2">
                        {allActive ? (
                          <CheckSquare className="w-5 h-5 text-green-600" />
                        ) : (
                          <Square className="w-5 h-5 text-gray-400" />
                        )}
                        <span className="font-semibold text-gray-900">{labels.title}</span>
                      </div>
                      <span className="text-sm text-gray-600">
                        ({activeCount}/{totalCount})
                      </span>
                    </button>
                    <button
                      onClick={() => toggleAllInSection(sectionKey, !allActive)}
                      className={`px-3 py-1 rounded text-sm font-medium transition-colors ${
                        allActive
                          ? 'bg-red-100 text-red-700 hover:bg-red-200'
                          : 'bg-green-100 text-green-700 hover:bg-green-200'
                      }`}
                    >
                      {allActive ? 'Desativar Todos' : 'Ativar Todos'}
                    </button>
                  </div>

                  {isExpanded && (
                    <div className="p-4 space-y-2 bg-white">
                      {Object.entries(permissions[sectionKey])
                        .filter(([key]) => key !== 'view' || key === 'view')
                        .map(([key, value]) => {
                          const label = labels[key as keyof typeof labels];
                          if (!label || key === 'title') return null;

                          return (
                            <label
                              key={key}
                              className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                              <input
                                type="checkbox"
                                checked={value as boolean}
                                onChange={() => togglePermission(sectionKey, key)}
                                className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                              />
                              <div className="flex items-center gap-2">
                                {key === 'view' && <Eye className="w-4 h-4 text-gray-500" />}
                                <span className="text-gray-700">{String(label)}</span>
                              </div>
                            </label>
                          );
                        })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-6 border-t border-gray-200 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors font-medium"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-5 h-5" />
            {saving ? 'Salvando...' : 'Salvar Permissões'}
          </button>
        </div>
      </div>
    </div>
  );
}
