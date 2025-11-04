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
import { DataManagementTab } from './components/datamanagement/DataManagementTab';
import { useAuth } from './hooks/useAuth';
import { usePermissions } from './hooks/usePermissions';
import { initializeSystem } from './services/database';

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

  const renderTabContent = () => {
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
        return hasPermission('users.view') ? <UsersTab userId={user.id} /> : null;
      case 'datamanagement':
        return hasPermission('datamanagement.view') ? <DataManagementTab userId={user.id} hasPermission={hasPermission} /> : null;
      default:
        return hasPermission('attendance.view') ? <AttendanceTab userId={user.id} hasPermission={hasPermission} /> : null;
    }
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
      </Layout>
      <Toaster position="top-right" />
    </>
  );
}

export default App;