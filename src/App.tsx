import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { LoginForm } from './components/auth/LoginForm';
import { Layout } from './components/common/Layout';
import { TabNavigation, TabType } from './components/common/TabNavigation';
import { HelpButton } from './components/tutorial/HelpButton';
import { useAuth } from './hooks/useAuth';
import { usePermissions } from './hooks/usePermissions';
import { initializeSystem } from './services/database';

const AttendanceTab = lazy(() => import('./components/attendance/AttendanceTab').then(m => ({ default: m.AttendanceTab })));
const EmployeesTab = lazy(() => import('./components/employees/EmployeesTab').then(m => ({ default: m.EmployeesTab })));
const ReportsTab = lazy(() => import('./components/reports/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./components/settings/SettingsTab').then(m => ({ default: m.SettingsTab })));
const UsersTab = lazy(() => import('./components/users/UsersTab').then(m => ({ default: m.UsersTab })));
const FinancialTab = lazy(() => import('./components/financial/FinancialTab').then(m => ({ default: m.FinancialTab })));
const ErrorsTab = lazy(() => import('./components/errors/ErrorsTab').then(m => ({ default: m.ErrorsTab })));
const C6PaymentTab = lazy(() => import('./components/c6payment/C6PaymentTab').then(m => ({ default: m.C6PaymentTab })));
const DataManagementTab = lazy(() => import('./components/datamanagement/DataManagementTab').then(m => ({ default: m.DataManagementTab })));
const TutorialTab = lazy(() => import('./components/tutorial/TutorialTab').then(m => ({ default: m.TutorialTab })));

function App() {
  const { user, loading, login, logout } = useAuth();
  const { hasPermission } = usePermissions(user?.id || null);
  const [activeTab, setActiveTab] = useState<TabType>('attendance');

  useEffect(() => {
    initializeSystem();
  }, []);

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
        <LoginForm onLogin={login} />
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
        case 'errors':
          return hasPermission('errors.view') ? <ErrorsTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'settings':
          return hasPermission('settings.view') ? <SettingsTab hasPermission={hasPermission} /> : null;
        case 'users':
          return hasPermission('users.view') ? <UsersTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'datamanagement':
          return hasPermission('datamanagement.view') ? <DataManagementTab userId={user.id} hasPermission={hasPermission} /> : null;
        case 'tutorial':
          return <TutorialTab hasPermission={hasPermission} />;
        default:
          return hasPermission('attendance.view') ? <AttendanceTab userId={user.id} hasPermission={hasPermission} /> : null;
      }
    })();

    return <Suspense fallback={<LoadingFallback />}>{content}</Suspense>;
  };

  return (
    <>
      <Layout user={user} onLogout={logout}>
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={user.role}
          hasPermission={hasPermission}
        />
        {renderTabContent()}
        <HelpButton currentTab={activeTab} hasPermission={hasPermission} />
      </Layout>
      <Toaster position="top-right" />
    </>
  );
}

export default App;