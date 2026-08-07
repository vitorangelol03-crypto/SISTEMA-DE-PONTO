import React, { useState } from 'react';
import { LogIn, Eye, EyeOff, AlertCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { loginUser, User } from '../../services/database';
import { isNumericString } from '../../utils/validation';
import toast from 'react-hot-toast';

interface LoginFormProps {
  onLogin: (user: User) => void;
}

export const LoginForm: React.FC<LoginFormProps> = ({ onLogin }) => {
  const { t } = useTranslation();
  const [id, setId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!id || !password) {
      setError(t('login.error_empty'));
      return;
    }

    if (!isNumericString(id)) {
      setError(t('login.error_numeric'));
      return;
    }

    setLoading(true);

    try {
      const user = await loginUser(id, password);
      toast.success(t('login.success'));
      onLogin(user);
    } catch {
      setError(t('login.error_credentials'));
      toast.error(t('login.error_generic'));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = () => {
    toast.error(t('login.forgot_help'));
  };

  return (
    <main className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 bg-[linear-gradient(135deg,#4338ca_0%,#4f46e5_45%,#7c3aed_100%)]">
      {/* 07/08/2026 — a porta de entrada era uma pagina branca sem personalidade.
          Agora: fundo no gradiente da marca e o formulario num cartao branco
          flutuante. Mesmos campos, mesmos ids, mesmos textos. */}
      <div className="max-w-md w-full space-y-6 bg-white rounded-2xl shadow-2xl p-7 sm:p-9">
        <div>
          <div className="mx-auto h-14 w-14 flex items-center justify-center rounded-2xl shadow-lg bg-[linear-gradient(135deg,#4f46e5,#7c3aed)]">
            <LogIn className="h-7 w-7 text-white" />
          </div>
          <h2 className="mt-5 text-center text-3xl font-extrabold tracking-tight text-gray-900">
            {t('app.name')}
          </h2>
          <p className="mt-2 text-center text-sm text-gray-600">
            {t('login.subtitle')}
          </p>
        </div>

        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="flex items-center space-x-2 p-3 bg-red-50 border border-red-200 rounded-md">
              <AlertCircle className="w-4 h-4 text-red-500" />
              <span className="text-sm text-red-600">{error}</span>
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label htmlFor="id" className="block text-sm font-medium text-gray-700">
                {t('login.id_label')}
              </label>
              <input
                id="id"
                type="text"
                inputMode="numeric"
                pattern="\d*"
                value={id}
                onChange={(e) => {
                  const value = e.target.value.replace(/\D/g, '');
                  setId(value);
                }}
                className="mt-1 appearance-none relative block w-full px-3 py-2.5 min-h-[44px] border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 focus:z-10 text-sm"
                placeholder={t('login.id_placeholder')}
                required
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700">
                {t('login.password_label')}
              </label>
              <div className="mt-1 relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="appearance-none relative block w-full px-3 py-2.5 pr-10 min-h-[44px] border border-gray-300 placeholder-gray-400 text-gray-900 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500 focus:z-10 text-sm"
                  placeholder={t('login.password_placeholder')}
                  required
                />
                <button
                  type="button"
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t('login.hide_password') : t('login.show_password')}
                >
                  {showPassword ? (
                    <EyeOff className="h-4 w-4 text-gray-400" />
                  ) : (
                    <Eye className="h-4 w-4 text-gray-400" />
                  )}
                </button>
              </div>
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-3 px-4 min-h-[48px] items-center border border-transparent text-base font-bold rounded-xl text-white shadow-lg bg-[linear-gradient(135deg,#4f46e5,#7c3aed)] hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
            >
              {loading ? t('login.submitting') : t('login.submit')}
            </button>
          </div>

          <div className="text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-sm text-blue-600 hover:text-blue-500"
            >
              {t('login.forgot')}
            </button>
          </div>

          <div className="border-t pt-4 space-y-2">
            <button
              type="button"
              onClick={() => window.location.href = '/?mode=clock'}
              className="w-full py-2.5 px-4 min-h-[44px] border-2 border-indigo-600 text-indigo-700 text-sm font-semibold rounded-xl hover:bg-indigo-50 transition-colors"
            >
              {t('login.employee_button')}
            </button>
            <button
              type="button"
              onClick={() => window.location.href = '/?mode=erros'}
              className="w-full py-2.5 px-4 min-h-[44px] border-2 border-orange-600 text-orange-700 text-sm font-semibold rounded-xl hover:bg-orange-50 transition-colors"
            >
              {t('login.errors_button')}
            </button>
          </div>
        </form>
      </div>
    </main>
  );
};