import React, { useState, useEffect } from 'react';
import { useAuth } from './context/AuthContext';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import TasksPage from './pages/TasksPage';
import TeamPage from './pages/TeamPage';
import ChatPage from './pages/ChatPage';
import InternRecordsPage from './pages/InternRecordsPage';
import AttendancePage from './pages/AttendancePage';
import SettingsPage from './pages/SettingsPage';
import Navbar from './components/Navbar';
import Sidebar from './components/Sidebar';

export const App = () => {
  const { user, isAuthenticated, loading } = useAuth();
  
  const isHRUser = (u) => {
    const role = (u?.role || '').toLowerCase();
    const desig = (u?.designation || '').toLowerCase();
    return role === 'hr' || role === 'human_resource_manager' || desig.includes('human resource');
  };

  const canAccessHR = (u) => {
    if (!u) return false;
    const role = (u?.role || '').toLowerCase();
    const desig = (u?.designation || '').toLowerCase();
    const isSuperAdminOrAdmin = role === 'admin' || role === 'super_admin' || role === 'superadmin';
    const isHR = role === 'hr' || role === 'human_resource_manager' || desig.includes('human resource');
    return isSuperAdminOrAdmin || isHR;
  };

  // Tab state: 'dashboard', 'tasks', 'team', 'hr', 'settings'
  const [currentTab, setCurrentTab] = useState(() => {
    const hash = window.location.hash.replace('#', '');
    try {
      const savedUser = JSON.parse(localStorage.getItem('user') || 'null');
      if (hash === 'hr' && !canAccessHR(savedUser)) {
        // Overback to dashboard if unauthorized role tries to load #hr directly
        return 'dashboard';
      }
      if (isHRUser(savedUser) && (!hash || hash === 'dashboard')) return 'hr';
    } catch {
      // ignore
    }
    const validTabs = ['dashboard', 'tasks', 'team', 'chat', 'attendance', 'hr', 'settings'];
    if (validTabs.includes(hash)) return hash;
    return 'dashboard';
  });

  useEffect(() => {
    window.location.hash = currentTab;
  }, [currentTab]);

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.replace('#', '');
      // Route Protection: If unauthorized role attempts to reach the "HR" site, overback to dashboard
      if (hash === 'hr' && user && !canAccessHR(user)) {
        setCurrentTab('dashboard');
        window.location.hash = 'dashboard';
        return;
      }
      if (['dashboard', 'tasks', 'team', 'chat', 'attendance', 'hr', 'settings'].includes(hash)) {
        setCurrentTab(hash);
      }
    };
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, [user]);

  // Route Protection: If currentTab is 'hr' and user cannot access HR, immediately overback to dashboard
  useEffect(() => {
    if (user && currentTab === 'hr' && !canAccessHR(user)) {
      setCurrentTab('dashboard');
      window.location.hash = 'dashboard';
    }
  }, [currentTab, user]);

  // If logged in as HR Manager and on default hash, directly redirect to 'hr' tab
  useEffect(() => {
    if (user && isHRUser(user) && (!window.location.hash || window.location.hash === '#dashboard' || window.location.hash === '#')) {
      setCurrentTab('hr');
      window.location.hash = 'hr';
    }
  }, [user]);

  if (loading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center space-y-3">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-600 rounded-full animate-spin" />
          <span className="text-xs text-slate-500 font-semibold tracking-wider uppercase">
            Loading Workspace...
          </span>
        </div>
      </div>
    );
  }

  // If not authenticated, render the Split-Screen Login Page
  if (!isAuthenticated) {
    return (
      <LoginPage
        onLoginSuccess={(loggedInUser) => {
          if (isHRUser(loggedInUser)) {
            setCurrentTab('hr');
            window.location.hash = 'hr';
          } else {
            setCurrentTab('dashboard');
            window.location.hash = 'dashboard';
          }
        }}
      />
    );
  }

  return (
    <div className="h-screen w-full bg-[#f8fafc] flex flex-col font-sans text-slate-800 overflow-hidden">
      {/* Top Navbar: Edge Left Logo, Last 2nd Edge Notification, Edge Right Profile */}
      <Navbar onNavigate={setCurrentTab} currentTab={currentTab} />

      {/* Main Body: Sidebar + Dynamic Page Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar currentTab={currentTab} onSelectTab={setCurrentTab} />

        {/* Dynamic Page Content */}
        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {currentTab === 'dashboard' && <DashboardPage onNavigate={setCurrentTab} />}
          {currentTab === 'tasks' && <TasksPage />}
          {currentTab === 'team' && <TeamPage />}
          {currentTab === 'chat' && <ChatPage />}
          {currentTab === 'attendance' && <AttendancePage />}
          {currentTab === 'hr' && (canAccessHR(user) ? <InternRecordsPage /> : <DashboardPage onNavigate={setCurrentTab} />)}
          {currentTab === 'settings' && <SettingsPage />}
        </main>
      </div>
    </div>
  );
};

export default App;
