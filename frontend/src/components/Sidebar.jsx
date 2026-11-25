import React, { useState, useEffect } from 'react';
import {
  LayoutDashboard,
  CheckSquare,
  Users,
  Settings,
  ShieldCheck,
  ChevronRight,
  Pin,
  PanelLeft,
  PanelLeftClose,
  PanelLeftOpen,
  FileSpreadsheet,
  MessageSquare,
  CalendarCheck,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar = ({ currentTab, onSelectTab }) => {
  const { user } = useAuth();
  const [imgError, setImgError] = useState(false);

  // User choice: 'fixed' or 'collapsible'
  const [sidebarMode, setSidebarMode] = useState(() => {
    try {
      const saved = localStorage.getItem('sidebar_mode');
      if (saved === 'collapsible' || saved === 'fixed') {
        return saved;
      }
    } catch {
      // ignore
    }
    return 'fixed'; // Default format: fixed
  });

  // Collapsed state (active only when in 'collapsible' mode)
  const [isCollapsed, setIsCollapsed] = useState(() => {
    try {
      return localStorage.getItem('sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  // Switch between 'fixed' and 'collapsible' modes
  const handleModeChange = (newMode) => {
    setSidebarMode(newMode);
    try {
      localStorage.setItem('sidebar_mode', newMode);
    } catch (err) {
      console.error('Failed to save sidebar mode', err);
    }

    if (newMode === 'fixed') {
      // In fixed mode, ensure the sidebar stays fully expanded at w-64
      setIsCollapsed(false);
      try {
        localStorage.setItem('sidebar_collapsed', 'false');
      } catch {
        // ignore
      }
    } else if (newMode === 'collapsible') {
      // Automatically minimize/collapse the sidebar when collapsible mode is selected
      setIsCollapsed(true);
      try {
        localStorage.setItem('sidebar_collapsed', 'true');
      } catch {
        // ignore
      }
    }
  };

  // Toggle collapse/expand (available only in 'collapsible' mode)
  const toggleCollapse = () => {
    if (sidebarMode !== 'collapsible') return;
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('sidebar_collapsed', String(next));
      } catch (err) {
        console.error('Failed to save collapse state', err);
      }
      return next;
    });
  };

  // Keyboard shortcut: Ctrl + B / Cmd + B to toggle collapse
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
        e.preventDefault();
        if (sidebarMode === 'collapsible') {
          toggleCollapse();
        } else {
          // If in fixed mode, switch to collapsible and collapse
          handleModeChange('collapsible');
          setIsCollapsed(true);
          try {
            localStorage.setItem('sidebar_collapsed', 'true');
          } catch {
            // ignore
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [sidebarMode]);

  useEffect(() => {
    setImgError(false);
  }, [user?.avatar, user?.photo]);

  const photoUrl = user?.avatar || user?.photo;

  // The effective collapsed state: true only if collapsible mode AND collapsed
  const isEffectiveCollapsed = sidebarMode === 'collapsible' && isCollapsed;

  const userRole = (user?.role || '').toLowerCase();
  const isSuperAdminOrAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin';
  const isHR = userRole === 'hr' || userRole === 'human_resource_manager' || (user?.designation && user.designation.toLowerCase().includes('human resource'));
  const canAccessHR = isSuperAdminOrAdmin || isHR;

  const navItems = [
    {
      id: 'dashboard',
      index: '01',
      label: 'Dashboard',
      icon: LayoutDashboard,
      description: 'Overview & work counts',
    },
    {
      id: 'tasks',
      index: '02',
      label: 'My Task',
      icon: CheckSquare,
      description: 'Board & tabular views',
    },
    {
      id: 'team',
      index: '03',
      label: 'Team Members',
      icon: Users,
      description: user?.role === 'intern' ? 'Higher designations' : 'Hierarchy & team',
    },
    {
      id: 'chat',
      index: '04',
      label: 'Chat',
      icon: MessageSquare,
      description: 'Direct & group messaging',
    },
    {
      id: 'attendance',
      index: '05',
      label: 'Attendance',
      icon: CalendarCheck,
      description: 'Check-in & attendance ledger',
    },
    {
      id: 'hr',
      index: '06',
      label: 'HR',
      icon: FileSpreadsheet,
      description: 'Intern Record Details',
    },
    {
      id: 'settings',
      index: '07',
      label: 'Settings',
      icon: Settings,
      description: 'Profile & preferences',
    },
  ];

  const visibleNavItems = navItems
    .filter((item) => {
      // HR tab should represent ONLY in "Super Admin", "Admin", and "Human Resource Manager"
      // Rest of the designation roles disappear
      if (item.id === 'hr') {
        return canAccessHR;
      }
      return true;
    })
    .map((item, idx) => ({
      ...item,
      // For Super Admin/Admin/HR: Dashboard(01), Tasks(02), Team(03), HR(04), Settings(05)
      // For Intern/Team Lead: Dashboard(01), Tasks(02), Team(03), Settings(04)
      index: String(idx + 1).padStart(2, '0'),
    }));

  const formatRoleName = (role) => {
    switch (role?.toLowerCase()) {
      case 'super_admin': return 'Super Admin';
      case 'admin': return 'Admin';
      case 'team_lead': return 'Team Lead';
      case 'intern': return 'Intern';
      case 'hr':
      case 'human_resource_manager': return 'Human Resource Manager';
      default: return role || 'User';
    }
  };

  return (
    <aside
      className={`bg-white border-r border-slate-200 flex flex-col justify-between shrink-0 h-[calc(100vh-4rem)] sticky top-16 z-30 transition-all duration-300 ease-in-out select-none ${
        isEffectiveCollapsed ? 'w-20' : 'w-64'
      } overflow-y-auto`}
      aria-expanded={!isEffectiveCollapsed}
    >
      {/* Top Section */}
      <div className={`space-y-2 ${isEffectiveCollapsed ? 'p-2.5' : 'p-4'}`}>
        {/* User Choice Control: Fixed vs Collapsible Format */}
        {!isEffectiveCollapsed ? (
          <div className="mb-3 p-2 bg-slate-50/90 rounded-xl border border-slate-200/80 space-y-1.5 shadow-2xs">
            <div className="flex items-center justify-between px-1">
              {/* <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Sidebar Format
              </span> */}
              {sidebarMode === 'collapsible' ? (
                <button
                  type="button"
                  onClick={toggleCollapse}
                  className="p-1 rounded-md text-slate-400 hover:text-slate-800 hover:bg-slate-200/60 transition-colors cursor-pointer"
                  title="Collapse to mini sidebar (Ctrl+B)"
                  aria-label="Collapse sidebar"
                >
                  <PanelLeftClose className="w-3.5 h-3.5" />
                </button>
              ) : (<div/>
                // <span className="inline-flex items-center gap-1 text-[10px] font-medium text-brand-700 bg-brand-50 px-1.5 py-0.5 rounded border border-brand-200/60">
                //   <Pin className="w-2.5 h-2.5 fill-brand-600/30 text-brand-600" />
                //   Fixed
                // </span>
              )}
            </div>

            {/* Segmented Choice Buttons: Fixed vs Collapsible */}
            <div className="grid grid-cols-2 p-1 bg-white rounded-lg border border-slate-200/80 gap-1 text-xs font-medium">
              <button
                type="button"
                onClick={() => handleModeChange('fixed')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all cursor-pointer ${
                  sidebarMode === 'fixed'
                    ? 'bg-brand-600 text-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="Fixed Sidebar"
              >
                <Pin className={`w-3.5 h-3.5 ${sidebarMode === 'fixed' ? 'fill-white' : ''}`} />
                {/* <span>Fixed</span> */}
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('collapsible')}
                className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-all cursor-pointer ${
                  sidebarMode === 'collapsible'
                    ? 'bg-brand-600 text-white font-semibold shadow-2xs'
                    : 'text-slate-500 hover:text-slate-900 hover:bg-slate-50'
                }`}
                title="Collapsible Sidebar"
              >
                <PanelLeft className="w-3.5 h-3.5" />
                {/* <span>Collapsible</span> */}
              </button>
            </div>
          </div>
        ) : (
          /* Mini Header for Collapsed State: Expand & Pin Options */
          <div className="flex flex-col items-center gap-1.5 mb-2 pb-1 border-b border-slate-200/70">
            {/* <button
              type="button"
              onClick={toggleCollapse}
              className="p-2 rounded-xl text-brand-700 bg-brand-50 hover:bg-brand-100 border border-brand-200/80 transition-colors cursor-pointer"
              title="Expand sidebar (Ctrl+B)"
              aria-label="Expand sidebar"
            >
              <PanelLeftOpen className="w-4 h-4" />
            </button> */}
            <button
              type="button"
              onClick={() => handleModeChange('fixed')}
              className="p-1 rounded-md text-slate-400 hover:text-brand-700 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Switch to Fixed format"
              aria-label="Switch to Fixed mode"
            >
              <Pin className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Profile Photo: Centered Square Photo in Passport Size Format (Expanded when open, compact when collapsed) */}
        {!isEffectiveCollapsed ? (
          /* Expanded State: Centered Expanded Square Profile Photo (Passport Size Format) */
          <div className="flex justify-center mb-3">
            <div
              onClick={() => onSelectTab && onSelectTab('settings')}
              className="cursor-pointer shrink-0 group"
              title="Click to view Profile & Settings"
            >
              {photoUrl && !imgError ? (
                <img
                  src={photoUrl}
                  alt={user?.full_name || 'Employee Photo'}
                  onError={() => setImgError(true)}
                  className="w-48 h-47 aspect-square rounded-sm object-cover border border-slate-300 shadow-xs transition-transform group-hover:scale-[1.02]"
                />
              ) : (
                <div className="w-48 h-47 aspect-square rounded-sm bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 text-brand-800 font-bold flex items-center justify-center text-3xl shadow-xs transition-transform group-hover:scale-[1.02]">
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
                </div>
              )}
            </div>
          </div>
        ) : (
          /* Collapsed State: Centered Square Photo in Passport Size Format Only */
          <div className="flex justify-center mb-3">
            <div
              onClick={() => onSelectTab && onSelectTab('settings')}
              className="cursor-pointer shrink-0"
              title="Click to view Profile & Settings"
            >
              {photoUrl && !imgError ? (
                <img
                  src={photoUrl}
                  alt={user?.full_name || 'Employee Photo'}
                  onError={() => setImgError(true)}
                  className="w-12 h-12 aspect-square rounded-sm object-cover border border-slate-300 shadow-xs"
                />
              ) : (
                <div className="w-12 h-12 aspect-square rounded-sm bg-gradient-to-br from-brand-100 to-brand-200 border border-brand-300 text-brand-800 font-bold flex items-center justify-center text-base shadow-xs">
                  {user?.full_name ? user.full_name.charAt(0).toUpperCase() : 'E'}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Section Divider / Label */}
        {!isEffectiveCollapsed ? (
          <div className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Main Menu
          </div>
        ) : (
          <div className="w-8 h-px bg-slate-200 mx-auto my-2" />
        )}

        {/* Navigation Items */}
        <div className="space-y-1.5">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentTab === item.id;

            if (isEffectiveCollapsed) {
              return (
                <div key={item.id} className="relative group flex justify-center">
                  <button
                    type="button"
                    onClick={() => onSelectTab(item.id)}
                    className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all cursor-pointer relative ${
                      isActive
                        ? 'bg-brand-50 text-brand-800 border border-brand-200/80 shadow-xs font-semibold'
                        : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                    title={`${item.label}`}
                    aria-label={item.label}
                  >
                    {/* Active Left Indicator Bar */}
                    {isActive && (
                      <span className="absolute left-0 top-2.5 bottom-2.5 w-1 bg-brand-600 rounded-r-full" />
                    )}
                    <div
                      className={`p-1.5 rounded-lg transition-colors ${
                        isActive
                          ? 'bg-brand-600 text-white'
                          : 'text-slate-500 group-hover:text-slate-800 bg-slate-100/80'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                  </button>

                  {/* Floating Tooltip for Collapsed Mode */}
                  <div className="pointer-events-none absolute left-full top-1/2 -translate-y-1/2 ml-3 z-50 hidden group-hover:flex items-center">
                    {/* <div className="bg-slate-900 text-white px-3 py-2 rounded-lg text-xs font-medium whitespace-nowrap shadow-xl border border-slate-700/60 flex flex-col gap-0.5">
                      <div className="flex items-center gap-1.5 font-semibold">
                        <span className="text-brand-300 font-mono text-[10px]">{item.index}.</span>
                        <span>{item.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-300 font-normal">{item.description}</span>
                    </div> */}
                  </div>
                </div>
              );
            }

            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onSelectTab(item.id)}
                className={`w-full flex items-center justify-between px-3.5 py-3 rounded-xl text-left transition-all group cursor-pointer ${
                  isActive
                    ? 'bg-brand-50 text-brand-800 font-semibold border border-brand-200/80 shadow-xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div
                    className={`p-1.5 rounded-lg transition-colors shrink-0 ${
                      isActive ? 'bg-brand-600 text-white' : 'text-slate-400 group-hover:text-slate-700 bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center space-x-1.5">
                      {/* <span className="text-[11px] text-slate-400 font-mono font-medium">{item.index}.</span> */}
                      <span className="text-sm truncate">{item.label}</span>
                    </div>
                    {/* <p className="text-[11px] text-slate-400 font-normal leading-none mt-0.5 truncate">
                      {item.description}
                    </p> */}
                  </div>
                </div>
                <ChevronRight
                  className={`w-4 h-4 transition-transform shrink-0 ${
                    isActive ? 'text-brand-600 translate-x-0.5' : 'text-slate-300 opacity-0 group-hover:opacity-100'
                  }`}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom Footer */}
      <div className={`border-t border-slate-200/80 ${isEffectiveCollapsed ? 'p-2 flex justify-center' : 'p-3'}`}>
        {!isEffectiveCollapsed ? (
          sidebarMode === 'collapsible' ? (
            /* Bottom Collapse Button when in Collapsible Mode */
            // <button
            //   type="button"
            //   onClick={toggleCollapse}
            //   className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100/90 transition-all cursor-pointer group"
            //   title="Collapse sidebar (Ctrl+B)"
            // >
            //   <div className="flex items-center gap-2">
            //     <PanelLeftClose className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
            //     <span>Collapse Sidebar</span>
            //   </div>
            //   <kbd className="text-[10px] font-mono px-1.5 py-0.5 bg-slate-100 border border-slate-200 rounded text-slate-400 group-hover:text-slate-600">
            //     Ctrl+B
            //   </kbd>
            // </button>
            <div></div>
          ) : (
            <div/>
            /* Fixed Mode Footer Card */
            // <div className="p-2.5 bg-slate-50/90 rounded-xl border border-slate-200/80">
            //   <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-1">
            //     <div className="flex items-center space-x-1.5">
            //       <ShieldCheck className="w-3.5 h-3.5 text-brand-600" />
            //       <span>Access: {formatRoleName(user?.role)}</span>
            //      </div>
            //        <span className="inline-block w-2 h-2 rounded-full bg-emerald-500" title="Locked & Active" />
            //   </div>
            // </div>
          )
        ) : (<div/>
          /* Mini Bottom Button when Collapsed */
          // <button
          //   type="button"
          //   onClick={toggleCollapse}
          //   className="w-11 h-11 rounded-xl flex items-center justify-center text-slate-400 hover:text-brand-700 hover:bg-slate-100 transition-all cursor-pointer group"
          //   title="Expand sidebar (Ctrl+B)"
          //   aria-label="Expand sidebar"
          // >
          //   <PanelLeftOpen className="w-4 h-4 text-slate-400 group-hover:text-brand-700 transition-colors" />
          // </button>
        )}
      </div>
    </aside>
  );
};

export default Sidebar;
