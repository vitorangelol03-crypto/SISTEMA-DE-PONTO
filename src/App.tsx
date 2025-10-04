import React, { useState, useEffect, lazy, Suspense } from 'react';
import { Toaster } from 'react-hot-toast';
import { LoginForm } from './components/auth/LoginForm';
import { Layout } from './components/common/Layout';
import { TabNavigation, TabType } from './components/common/TabNavigation';
import { useAuth } from './hooks/useAuth';

const AttendanceTab = lazy(() => import('./components/attendance/AttendanceTab').then(m => ({ default: m.AttendanceTab })));
const EmployeesTab = lazy(() => import('./components/employees/EmployeesTab').then(m => ({ default: m.EmployeesTab })));
const ReportsTab = lazy(() => import('./components/reports/ReportsTab').then(m => ({ default: m.ReportsTab })));
const SettingsTab = lazy(() => import('./components/settings/SettingsTab').then(m => ({ default: m.SettingsTab })));
const UsersTab = lazy(() => import('./components/users/UsersTab').then(m => ({ default: m.UsersTab })));
const FinancialTab = lazy(() => import('./components/financial/FinancialTab').then(m => ({ default: m.FinancialTab })));
const ErrorsTab = lazy(() => import('./components/errors/ErrorsTab').then(m => ({ default: m.ErrorsTab })));

function App() {
  const { user, loading, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');

  useEffect(() => {
    console.log('Sistema inicializado com sucesso!');
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

  const renderTabContent = () => {
    const LoadingFallback = (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );

    return (
      <Suspense fallback={LoadingFallback}>
        {activeTab === 'attendance' && <AttendanceTab userId={user.id} />}
        {activeTab === 'employees' && <EmployeesTab userId={user.id} />}
        {activeTab === 'reports' && <ReportsTab userId={user.id} />}
        {activeTab === 'financial' && <FinancialTab userId={user.id} />}
        {activeTab === 'errors' && <ErrorsTab userId={user.id} />}
        {activeTab === 'settings' && <SettingsTab />}
        {activeTab === 'users' && user.role === 'admin' && <UsersTab userId={user.id} />}
      </Suspense>
    );
  };

  return (
    <>
      <Layout user={user} onLogout={logout}>
        <TabNavigation
          activeTab={activeTab}
          onTabChange={setActiveTab}
          userRole={user.role}
        />
        {renderTabContent()}
      </Layout>
      <Toaster position="top-right" />
    </>
  );
}

export default App;