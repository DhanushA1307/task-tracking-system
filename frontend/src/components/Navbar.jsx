import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from './BrandLogo';
import NotificationDrawer from './NotificationDrawer';
import { Bell, ChevronDown, User, LogOut, Settings as SettingsIcon, Shield, Briefcase, GraduationCap, Users } from 'lucide-react';
import { notificationsApi } from '../api/client';

export const Navbar = ({ onNavigate, currentTab }) => {
  const { user, logout, switchRole } = useAuth();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const profileMenuRef = useRef(null);
  const notifRef = useRef(null);

  // Real-time SSE Notifications: Triggered ONLY when task is assigned or updated (No setInterval)
  useEffect(() => {
    if (!user) return;

    // 1. Initial count fetch on mount/login
    const fetchCount = async () => {
      try {
        const res = await notificationsApi.getNotifications(10);
        setUnreadCount(res.data.unread_count || 0);
      } catch (err) {
        // quiet error
      }
    };
    fetchCount();

    // 2. Real-time SSE stream: triggers immediately when a task is assigned
    const token = localStorage.getItem('token');
    if (!token) return;

    let eventSource = null;
    let reconnectTimeout = null;

    const connectSSE = () => {
      try {
        eventSource = new EventSource(`/api/notifications/stream?token=${encodeURIComponent(token)}`);

        eventSource.addEventListener('notification', (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.unread_count !== undefined) {
              setUnreadCount(data.unread_count);
            } else {
              setUnreadCount((prev) => prev + 1);
            }
          } catch (e) {
            console.error('Error handling SSE notification', e);
          }
        });

        eventSource.addEventListener('connected', () => {
          // Handshake acknowledged
        });

        eventSource.onerror = () => {
          if (eventSource) {
            eventSource.close();
            eventSource = null;
          }
          // Exponential backoff or standard reconnect
          reconnectTimeout = setTimeout(connectSSE, 5000);
        };
      } catch (err) {
        console.error('SSE initialization error', err);
      }
    };

    connectSSE();

    // 3. Real-time WebSocket Presence: verifies employee active presence (Available vs NA)
    let ws = null;
    let wsTimeout = null;
    let shouldReconnect = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsBase = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
    const wsUrl = `${wsBase}/api/ws/presence?token=${encodeURIComponent(token)}`;

    const connectWS = () => {
      try {
        ws = new WebSocket(wsUrl);
        ws.onopen = () => {
          // Send periodic ping to maintain WebSocket connection
          const pingInterval = setInterval(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send('ping');
            } else {
              clearInterval(pingInterval);
            }
          }, 25000);
        };
        ws.onclose = () => {
          if (shouldReconnect) {
            wsTimeout = setTimeout(connectWS, 4000);
          }
        };
        ws.onerror = () => {
          ws?.close();
        };
      } catch (err) {
        // ignore ws connection failures
      }
    };

    connectWS();

    return () => {
      shouldReconnect = false;
      if (reconnectTimeout) clearTimeout(reconnectTimeout);
      if (eventSource) eventSource.close();
      if (wsTimeout) clearTimeout(wsTimeout);
      if (ws) ws.close();
    };
  }, [user]);

  // Click outside to close menus
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target)) {
        setShowProfileMenu(false);
      }
      if (notifRef.current && !notifRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const getRoleBadge = (role) => {
    switch (role) {
      case 'super_admin':
        return { label: 'Super Admin', color: 'bg-purple-100 text-purple-700 border-purple-200', icon: Shield };
      case 'admin':
        return { label: 'Admin', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: Shield };
      case 'hr':
      case 'human_resource_manager':
        return { label: 'HR Manager', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: Shield };
      case 'team_lead':
        return { label: 'Team Lead', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Users };
      case 'intern':
      default:
        return { label: 'Intern', color: 'bg-brand-100 text-brand-700 border-brand-200', icon: GraduationCap };
    }
  };

  const roleInfo = getRoleBadge(user?.role);
  const RoleIcon = roleInfo.icon;

  return (
    <header className="h-16 bg-white border-b border-slate-200 px-6 flex items-center justify-between sticky top-0 z-40 shadow-xs">
      {/* Edge of Left Side: Company Logo */}
      <div className="flex items-center space-x-6">
        <div onClick={() => onNavigate && onNavigate('dashboard')}>
          <BrandLogo />
        </div>
        <div className="hidden md:flex items-center space-x-2 pl-4 border-l border-slate-200 text-xs text-slate-500">
          <span className="font-semibold text-slate-700">Task Tracking System</span>
          <span>•</span>
          <span className="capitalize">{user?.department || 'Edutech'} Workspace</span>
        </div>
      </div>

      {/* Right Side: Notification (Last 2nd Edge) & Profile (Edge of Right Side) */}
      <div className="flex items-center space-x-3">
        {/* Last 2nd Edge of Right Side: Notification */}
        <div className="relative" ref={notifRef}>
          <button
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-full transition-colors relative cursor-pointer focus:outline-none"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 w-4 h-4 bg-rose-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          <NotificationDrawer
            isOpen={showNotifications}
            onClose={() => setShowNotifications(false)}
            onCountChange={setUnreadCount}
            onSelectTask={() => {
              setShowNotifications(false);
              onNavigate && onNavigate('tasks');
            }}
          />
        </div>

        {/* Edge of Right Side: Profile */}
        <div className="relative" ref={profileMenuRef}>
          <button
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            className="flex items-center space-x-2.5 p-1.5 rounded-full md:rounded-lg hover:bg-slate-100 transition-colors cursor-pointer focus:outline-none"
            aria-label="User Profile Menu"
          >
            {user?.avatar ? (
              <img
                src={user.avatar}
                alt={user?.full_name || 'Profile'}
                className="w-8 h-8 rounded-full object-cover ring-2 ring-brand-500/20"
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-semibold flex items-center justify-center text-sm ring-1 ring-slate-300">
                {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'U'}
              </div>
            )}
            <span className="hidden md:inline-block text-sm font-medium text-slate-800">
              {user?.full_name || 'User'}
            </span>
            <ChevronDown className="hidden md:inline-block w-4 h-4 text-slate-400" />
          </button>

          {/* Profile Dropdown Menu */}
          {showProfileMenu && (
            <div className="absolute right-0 top-12 w-64 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              {/* User Identity Header */}
              <div className="px-4 py-3 border-b border-slate-100">
                <p className="text-sm font-semibold text-slate-900 truncate">{user?.full_name}</p>
                <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                <div className="mt-2 flex items-center justify-between">
                  <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border ${roleInfo.color}`}>
                    <RoleIcon className="w-3 h-3 mr-1" />
                    {roleInfo.label}
                  </span>
                  <span className="text-[10px] text-slate-400 font-mono">{user?.employee_number}</span>
                </div>
                {/* Rule: Except Intern and Team Leader, show employee count and successor account availability */}
                {user && user.role !== 'intern' && user.role !== 'team_lead' && user.role !== 'team_leader' && (
                  <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] space-y-1">
                    <div className="flex justify-between text-slate-500">
                      <span>Employee Count:</span>
                      <span className="font-bold text-slate-800">{user.employee_count || 'NA'}</span>
                    </div>
                    {/* <div className="flex justify-between text-slate-500">
                      <span>Successor Account:</span>
                      <span className={`font-semibold ${user.successor_account_available === 'Available' ? 'text-emerald-700' : 'text-slate-500'}`}>
                        {user.successor_account_available || 'NA'}
                      </span>
                    </div> */}
                  </div>
                )}
              </div>

              {/* Fast Role Switcher (For Pair-Programming / Demo Testing) */}
              {/*<div className="px-4 py-2 border-b border-slate-100 bg-slate-50/60">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Quick Switch Role
                </span>
                <div className="grid grid-cols-2 gap-1.5 text-xs">
                  <button
                    onClick={() => { switchRole('intern'); setShowProfileMenu(false); }}
                    className={`px-2 py-1 rounded text-left flex items-center space-x-1 transition-colors ${
                      user?.role === 'intern' ? 'bg-brand-600 text-white font-medium' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <GraduationCap className="w-3 h-3" />
                    <span>Intern</span>
                  </button>
                  <button
                    onClick={() => { switchRole('team_lead'); setShowProfileMenu(false); }}
                    className={`px-2 py-1 rounded text-left flex items-center space-x-1 transition-colors ${
                      user?.role === 'team_lead' ? 'bg-brand-600 text-white font-medium' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Users className="w-3 h-3" />
                    <span>Team Lead</span>
                  </button>
                  <button
                    onClick={() => { switchRole('admin'); setShowProfileMenu(false); }}
                    className={`px-2 py-1 rounded text-left flex items-center space-x-1 transition-colors ${
                      user?.role === 'admin' ? 'bg-brand-600 text-white font-medium' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>Admin</span>
                  </button>
                  <button
                    onClick={() => { switchRole('super_admin'); setShowProfileMenu(false); }}
                    className={`px-2 py-1 rounded text-left flex items-center space-x-1 transition-colors ${
                      user?.role === 'super_admin' ? 'bg-brand-600 text-white font-medium' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>Super Admin</span>
                  </button>
                  <button
                    onClick={() => { switchRole('hr'); setShowProfileMenu(false); }}
                    className={`px-2 py-1 rounded text-left flex items-center space-x-1 transition-colors ${
                      user?.role === 'hr' ? 'bg-brand-600 text-white font-medium' : 'hover:bg-slate-200 text-slate-700'
                    }`}
                  >
                    <Shield className="w-3 h-3" />
                    <span>HR Manager</span>
                  </button>
                </div>
              </div>/*}

              {/* Navigation Links */}
              <div className="py-1">
                <button
                  onClick={() => {
                    onNavigate && onNavigate('settings');
                    setShowProfileMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50 flex items-center space-x-2"
                >
                  <SettingsIcon className="w-4 h-4 text-slate-400" />
                  <span>Settings & Profile</span>
                </button>
                <button
                  onClick={() => {
                    logout();
                    setShowProfileMenu(false);
                  }}
                  className="w-full px-4 py-2 text-left text-sm text-rose-600 hover:bg-rose-50 flex items-center space-x-2"
                >
                  <LogOut className="w-4 h-4 text-rose-500" />
                  <span>Sign Out</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;

