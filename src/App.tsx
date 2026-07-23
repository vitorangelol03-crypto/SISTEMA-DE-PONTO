import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { LoginForm } from './components/auth/LoginForm';
import { CompanySelector } from './components/auth/CompanySelector';
import { Layout } from './components/common/Layout';
import { ErrorBoundary } from './components/common/ErrorBoundary';
import { TabNavigation, TabType } from './components/common/TabNavigation';
import { HelpButton } from './components/tutorial/HelpButton';
import { useAuth } from './hooks/useAuth';
import { usePermissions } from './hooks/usePermissions';
import { useCompany } from './contexts/CompanyContext';
import { autoCreateWeeklyPeriod, type User } from './services/database';
import { EmployeeClockIn } from './components/employee-clock/EmployeeClockIn';

// Lazy: carrega jspdf/autotable transitivamente — só baixa no acesso a /erros.
const EmployeeErrorsPage = lazy(() =>
  import('./components/employee-clock/EmployeeErrorsPage').then(m => ({ default: m.EmployeeErrorsPage })),
);

// App do entregador (rota publica /driver) — login CPF, ver espelhos por quinzena.
const DriverApp = lazy(() =>
  import('./components/driver-app/DriverApp').then(m => ({ default: m.DriverApp })),
);

const AttendanceTab = lazy(() => import('./components/attendance/AttendanceTab').then(m => ({ default: m.AttendanceTab })));
const EmployeesTab = lazy(() => import('./components/employees/EmployeesTab').then(m => ({ default: m.EmployeesTab })));
const ReportsTab = lazy(() => import('./components/reports/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./components/settings/SettingsTab').then(m => ({ default: m.SettingsTab })));
const UsersTab = lazy(() => import('./components/users/UsersTab').then(m => ({ default: m.UsersTab })));
const FinancialTab = lazy(() => import('./components/financial/FinancialTab').then(m => ({ default: m.FinancialTab })));
const ErrorsTab = lazy(() => import('./components/errors/ErrorsTab').then(m => ({ default: m.ErrorsTab })));
const C6PaymentTab = lazy(() => import('./components/c6payment/C6PaymentTab').then(m => ({ default: m.C6PaymentTab })));
const DriverPayTab = lazy(() => import('./components/driverpay/DriverPayTab').then(m => ({ default: m.DriverPayTab })));
const DataManagementTab = lazy(() => import('./components/datamanagement/DataManagementTab').then(m => ({ default: m.DataManagementTab })));
const TutorialTab = lazy(() => import('./components/tutorial/TutorialTab').then(m => ({ default: m.TutorialTab })));
const AdminTab = lazy(() => import('./components/admin/AdminTab').then(m => ({ default: m.AdminTab })));

function App() {
  const { user, loading, login, logout } = useAuth();
  const { hasPermission } = usePermissions(user?.id || null);
  const { company, setCompany } = useCompany();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');
  // Admin sempre escolhe empresa após cada login (não em refresh).
  const [needsCompanySelection, setNeedsCompanySelection] = useState(false);

  const handleLogin = (loggedUser: User) => {
    login(loggedUser);
    if (loggedUser.role === 'admin') {
      setNeedsCompanySelection(true);
    } else if (loggedUser.role === 'supervisor') {
      // Supervisor: empresa atrelada ao usuário no banco — auto-seleciona.
      // No-op silencioso se ausente: mantém localStorage/DEFAULT do CompanyContext.
      const cid = (loggedUser as User & { company_id?: string }).company_id;
      if (cid) setCompany(cid);
    }
  };

  const handleLogout = () => {
    setNeedsCompanySelection(false);
    logout();
  };

  // Verifica se a URL indica modo de registro de ponto do funcionário
  const isClockMode =
    window.location.pathname === '/clock' ||
    new URLSearchParams(window.location.search).get('mode') === 'clock';

  // Modo de consulta de erros pelo funcionário (sem geolocalização)
  const isErrorsMode =
    window.location.pathname === '/erros' ||
    new URLSearchParams(window.location.search).get('mode') === 'erros';

  // App do entregador (espelhos + notas) — não exige login de painel
  const isDriverMode =
    window.location.pathname === '/driver' ||
    new URLSearchParams(window.location.search).get('mode') === 'driver';

  useEffect(() => {
    if (!company?.id) return;
    autoCreateWeeklyPeriod(company.id).catch(err => console.error('autoCreateWeeklyPeriod falhou:', err));
  }, [company?.id]);

  // Tela de registro de ponto — não exige login de supervisor
  if (isClockMode) {
    return (
      <>
        <EmployeeClockIn />
        <Toaster position="top-right" />
      </>
    );
  }

  // Tela de consulta de erros pelo funcionário
  if (isErrorsMode) {
    return (
      <>
        <Suspense fallback={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        }>
          <EmployeeErrorsPage />
        </Suspense>
        <Toaster position="top-right" />
      </>
    );
  }

  // App do entregador — tela pública própria (auth por CPF na edge fn driver-public-api)
  if (isDriverMode) {
    return (
      <>
        <Suspense fallback={
          <div className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-orange-600"></div>
          </div>
        }>
          <DriverApp />
        </Suspense>
        <Toaster position="top-right" />
      </>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Inicializando sistema...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <>
        <LoginForm onLogin={handleLogin} />
        <Toaster position="top-right" />
      </>
    );
  }

  // Admin precisa escolher empresa antes de ver o dashboard (apenas após login).
  if (user.role === 'admin' && needsCompanySelection) {
    return (
      <>
        <CompanySelector
          user={user}
          onSelected={() => setNeedsCompanySelection(false)}
          onLogout={handleLogout}
        />
        <Toaster position="top-right" />
      </>
    );
  }

  const LoadingFallback = () => (
    <div className="flex items-center justify-center p-8">
      <div className="text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">Carregando...</p>
      </div>
    </div>
  );

  const renderTabContent = () => {
    const content = (() => {
      switch (activeTab) {
        case 'attendance':
          return hasPermission('attendance.view') ? <AttendanceTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'employees':
          return hasPermission('employees.view') ? <EmployeesTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'reports':
          return hasPermission('reports.view') ? <ReportsTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'financial':
          return hasPermission('financial.view') ? <FinancialTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'c6payment':
          return hasPermission('c6payment.view') ? <C6PaymentTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'driverpay':
          return hasPermission('driverpay.view') ? <DriverPayTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'errors':
          return hasPermission('errors.view') ? <ErrorsTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'settings':
          return hasPermission('settings.view') ? <SettingsTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'users':
          return hasPermission('users.view') ? <UsersTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'datamanagement':
          return hasPermission('datamanagement.view') ? <DataManagementTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'tutorial':
          return <TutorialTab hasPermission={hasPermission} />;
        case 'admin':
          return <AdminTab userId={user.id} />;
        default:
          return hasPermission('attendance.view') ? <AttendanceTab userId={user.id} hasPermission={hasPermission} /> : null;
      }
    })();

    return <Suspense fallback={<LoadingFallback />}>{content}</Suspense>;
  };

  return (
    <>
      <ErrorBoundary userId={user.id} module="App">
        <Layout user={user} onLogout={handleLogout}>
          <TabNavigation
            activeTab={activeTab}
            onTabChange={setActiveTab}
            userRole={user.role}
            hasPermission={hasPermission}
          />
          <ErrorBoundary userId={user.id} module={`tab:${activeTab}`}>
            {renderTabContent()}
          </ErrorBoundary>
          <HelpButton currentTab={activeTab} hasPermission={hasPermission} />
        </Layout>
      </ErrorBoundary>
      <Toaster position="top-right" />
    </>
  );
}

export default App;