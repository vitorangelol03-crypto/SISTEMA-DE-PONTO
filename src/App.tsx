import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { LoginForm } from './components/auth/LoginForm';
import { Layout } from './components/common/Layout';
import { TabNavigation, TabType } from './components/common/TabNavigation';
import { AttendanceTab } from './components/attendance/AttendanceTab';
import { EmployeesTab } from './components/employees/EmployeesTab';
import { ReportsTab } from './components/reports/ReportsTab';
import { SettingsTab } from './components/settings/SettingsTab';
import { UsersTab } from './components/users/UsersTab';
import { FinancialTab } from './components/financial/FinancialTab';
import { ErrorsTab } from './components/errors/ErrorsTab';
import { C6PaymentTab } from './components/c6payment/C6PaymentTab';
import { useAuth } from './hooks/useAuth';
import { initializeSystem } from './services/database';

function App() {
  const { user, loading, login, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('attendance');

  useEffect(() => {
    // Inicializar sistema na primeira carga
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

  const renderTabContent = () => {
    switch (activeTab) {
      case 'attendance':
        return <AttendanceTab userId={user.id} />;
      case 'employees':
        return <EmployeesTab userId={user.id} />;
      case 'reports':
        return <ReportsTab userId={user.id} />;
      case 'financial':
        return <FinancialTab userId={user.id} />;
      case 'c6payment':
        return <C6PaymentTab userId={user.id} />;
      case 'errors':
        return <ErrorsTab userId={user.id} />;
      case 'settings':
        return <SettingsTab />;
      case 'users':
        return user.role === 'admin' ? <UsersTab userId={user.id} /> : null;
      default:
        return <AttendanceTab userId={user.id} />;
    }
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