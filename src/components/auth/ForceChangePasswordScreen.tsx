import React, { useState } from 'react';
import { KeyRound, Eye, EyeOff, LogOut } from 'lucide-react';
import { changeOwnPassword } from '../../services/database';
import toast from 'react-hot-toast';

interface ForceChangePasswordScreenProps {
  userId: string;
  onChanged: () => void;
  onLogout: () => void;
}

// Fase A do rework de Usuários (01/09/2026) — tela obrigatória exibida após
// login quando must_change_password=true (usuário acabou de ter a senha
// redefinida pra padrão pelo admin). Bloqueia acesso ao resto do app até
// definir uma senha própria; único jeito de sair daqui sem trocar é deslogar.
export const ForceChangePasswordScreen: React.FC<ForceChangePasswordScreenProps> = ({ userId, onChanged, onLogout }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (newPassword.length < 6) {
      setError('A nova senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('As senhas não coincidem.');
      return;
    }

    setLoading(true);
    try {
      await changeOwnPassword(newPassword);
      toast.success('Senha alterada com sucesso!');
      onChanged();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao trocar senha';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[linear-gradient(135deg,#4338ca_0%,#4f46e5_45%,#7c3aed_100%)]">
      <div className="max-w-md w-full space-y-6 bg-white rounded-2xl shadow-2xl p-7 sm:p-9">
        <div>
          <div className="mx-auto h-14 w-14 flex items-center justify-center rounded-2xl shadow-lg bg-[linear-gradient(135deg,#4f46e5,#7c3aed)]">
            <KeyRound className="h-7 w-7 text-white" />
          </div>
          <h2 className="mt-5 text-center text-2xl font-extrabold tracking-tight text-gray-900">
            Defina uma senha nova
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            Sua senha foi redefinida por um administrador (ID {userId}). Escolha uma senha própria pra continuar.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-sm text-red-600">
              {error}
            </div>
          )}

          <div>
            <label htmlFor="new-password" className="block text-sm font-medium text-gray-700">
              Nova senha
            </label>
            <div className="mt-1 relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="appearance-none relative block w-full px-3 py-2.5 pr-10 min-h-[44px] border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm"
                placeholder="Mínimo de 6 caracteres"
                required
                autoFocus
              />
              <button
                type="button"
                className="absolute inset-y-0 right-0 pr-3 flex items-center"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
              >
                {showPassword ? <EyeOff className="h-4 w-4 text-gray-400" /> : <Eye className="h-4 w-4 text-gray-400" />}
              </button>
            </div>
          </div>

          <div>
            <label htmlFor="confirm-new-password" className="block text-sm font-medium text-gray-700">
              Confirmar nova senha
            </label>
            <input
              id="confirm-new-password"
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="mt-1 appearance-none relative block w-full px-3 py-2.5 min-h-[44px] border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 text-sm"
              placeholder="Repita a senha"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="group relative w-full flex justify-center py-3 px-4 min-h-[48px] items-center border border-transparent text-base font-bold rounded-xl text-white shadow-lg bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            {loading ? 'Salvando...' : 'Salvar nova senha e entrar'}
          </button>

          <div className="text-center">
            <button
              type="button"
              onClick={onLogout}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700"
            >
              <LogOut className="w-3.5 h-3.5" />
              Não sou eu — sair
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};
