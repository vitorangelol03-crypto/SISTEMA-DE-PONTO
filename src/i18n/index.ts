/**
 * Sub-fase 17.5: setup multi-idioma (pt-BR default + en placeholder).
 *
 * MVP: usa react-i18next sem detection de browser language (default pt-BR
 * porque produto é brasileiro). Switch idiomático futuro via UI Header.
 *
 * Estratégia incremental: refator de 10-20 strings core agora (Login, Header,
 * Tabs); resto migra conforme demanda.
 *
 * Como adicionar nova string:
 *   1. Adicionar key em `pt-BR` (default) + `en` aqui
 *   2. Substituir literal por `t('key')` no componente
 *   3. Componente precisa importar `useTranslation()`
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const ptBR = {
  // Login
  'login.title': 'Sistema de Ponto',
  'login.id_placeholder': 'ID do usuário',
  'login.password_placeholder': 'Senha',
  'login.submit': 'Entrar',
  'login.invalid': 'ID ou senha incorretos',

  // Header / Layout
  'header.role.admin': 'Administrador',
  'header.role.supervisor': 'Supervisor',
  'header.logout': 'Sair',

  // Tabs (mantém pt-BR original — mas chaves prontas pra futura tradução)
  'tab.attendance': 'Ponto',
  'tab.employees': 'Funcionários',
  'tab.reports': 'Relatórios',
  'tab.financial': 'Financeiro',
  'tab.c6payment': 'Pagamento C6',
  'tab.errors': 'Erros',
  'tab.settings': 'Configurações',
  'tab.users': 'Usuários',
  'tab.datamanagement': 'Gerenciamento',
  'tab.tutorial': 'Ajuda',
  'tab.admin': 'Admin',

  // Common UI
  'common.save': 'Salvar',
  'common.cancel': 'Cancelar',
  'common.delete': 'Excluir',
  'common.edit': 'Editar',
  'common.confirm': 'Confirmar',
  'common.loading': 'Carregando...',
};

const en = {
  'login.title': 'Time Clock System',
  'login.id_placeholder': 'User ID',
  'login.password_placeholder': 'Password',
  'login.submit': 'Sign in',
  'login.invalid': 'Invalid ID or password',

  'header.role.admin': 'Administrator',
  'header.role.supervisor': 'Supervisor',
  'header.logout': 'Sign out',

  'tab.attendance': 'Clock',
  'tab.employees': 'Employees',
  'tab.reports': 'Reports',
  'tab.financial': 'Financial',
  'tab.c6payment': 'C6 Payment',
  'tab.errors': 'Errors',
  'tab.settings': 'Settings',
  'tab.users': 'Users',
  'tab.datamanagement': 'Data Mgmt',
  'tab.tutorial': 'Help',
  'tab.admin': 'Admin',

  'common.save': 'Save',
  'common.cancel': 'Cancel',
  'common.delete': 'Delete',
  'common.edit': 'Edit',
  'common.confirm': 'Confirm',
  'common.loading': 'Loading...',
};

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': { translation: ptBR },
      en: { translation: en },
    },
    lng: localStorage.getItem('app_locale') || 'pt-BR',
    fallbackLng: 'pt-BR',
    interpolation: { escapeValue: false },
  });

export default i18n;

/**
 * Setter de idioma persistido em localStorage.
 * Uso: setLocale('en'); window.location.reload() (ou re-render).
 */
export function setLocale(locale: 'pt-BR' | 'en'): void {
  localStorage.setItem('app_locale', locale);
  i18n.changeLanguage(locale);
}

export function getLocale(): string {
  return i18n.language;
}
