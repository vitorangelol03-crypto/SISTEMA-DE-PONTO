/**
 * Sub-fase 17.5 + 17.5.1: setup multi-idioma (pt-BR + en).
 *
 * v2 (17.5.1): expansão de chaves pra cobrir Login + Header + TabNavigation
 * (~60 strings). Refator real aplicado nos componentes correspondentes.
 *
 * Locale persistido em localStorage.app_locale (default pt-BR).
 *
 * Como adicionar novo idioma:
 *   1. Adicionar entrada em `resources` (linha ~155)
 *   2. Traduzir cada chave de `ptBR` pro idioma
 *   3. Adicionar opção no LanguageSwitcher
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';

const ptBR = {
  // App / Login
  'app.name': 'Sistema de Ponto',
  'login.subtitle': 'Entre com suas credenciais',
  'login.id_label': 'ID do Usuário',
  'login.id_placeholder': 'Digite apenas números',
  'login.password_label': 'Senha',
  'login.password_placeholder': 'Digite sua senha',
  'login.submit': 'Entrar',
  'login.submitting': 'Entrando...',
  'login.success': 'Login realizado com sucesso!',
  'login.error_credentials': 'Credenciais inválidas',
  'login.error_generic': 'Erro ao fazer login',
  'login.error_empty': 'Preencha todos os campos',
  'login.error_numeric': 'ID deve conter apenas números',
  'login.forgot': 'Esqueceu a senha?',
  'login.forgot_help': 'Entre em contato com o administrador do sistema',
  'login.show_password': 'Mostrar senha',
  'login.hide_password': 'Ocultar senha',
  'login.employee_button': 'Sou funcionário — Registrar Ponto',
  'login.errors_button': 'Ver meus erros',

  // Header / Layout
  'header.role.admin': 'Administrador',
  'header.role.supervisor': 'Supervisor',
  'header.logout': 'Sair',
  'header.user_id': 'ID',
  'header.language': 'Idioma',

  // Tabs
  'tab.attendance': 'Ponto',
  'tab.employees': 'Funcionários',
  'tab.reports': 'Relatórios',
  'tab.financial': 'Financeiro',
  'tab.c6payment': 'Pagamento C6',
  'tab.driverpay': 'Pagamentos Driver',
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
  'common.search': 'Buscar',
  'common.add': 'Adicionar',
  'common.export': 'Exportar',
  'common.import': 'Importar',
  'common.back': 'Voltar',
  'common.continue': 'Continuar',
  'common.yes': 'Sim',
  'common.no': 'Não',
};

const en: typeof ptBR = {
  'app.name': 'Time Clock System',
  'login.subtitle': 'Sign in with your credentials',
  'login.id_label': 'User ID',
  'login.id_placeholder': 'Numbers only',
  'login.password_label': 'Password',
  'login.password_placeholder': 'Enter your password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in...',
  'login.success': 'Login successful!',
  'login.error_credentials': 'Invalid credentials',
  'login.error_generic': 'Login error',
  'login.error_empty': 'Fill in all fields',
  'login.error_numeric': 'ID must contain only numbers',
  'login.forgot': 'Forgot password?',
  'login.forgot_help': 'Contact the system administrator',
  'login.show_password': 'Show password',
  'login.hide_password': 'Hide password',
  'login.employee_button': "I'm an employee — Clock In",
  'login.errors_button': 'View my errors',

  'header.role.admin': 'Administrator',
  'header.role.supervisor': 'Supervisor',
  'header.logout': 'Sign out',
  'header.user_id': 'ID',
  'header.language': 'Language',

  'tab.attendance': 'Clock',
  'tab.employees': 'Employees',
  'tab.reports': 'Reports',
  'tab.financial': 'Financial',
  'tab.c6payment': 'C6 Payment',
  'tab.driverpay': 'Driver Payments',
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
  'common.search': 'Search',
  'common.add': 'Add',
  'common.export': 'Export',
  'common.import': 'Import',
  'common.back': 'Back',
  'common.continue': 'Continue',
  'common.yes': 'Yes',
  'common.no': 'No',
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

export type SupportedLocale = 'pt-BR' | 'en';

export function setLocale(locale: SupportedLocale): void {
  localStorage.setItem('app_locale', locale);
  i18n.changeLanguage(locale);
}

export function getLocale(): SupportedLocale {
  return (i18n.language as SupportedLocale) || 'pt-BR';
}
