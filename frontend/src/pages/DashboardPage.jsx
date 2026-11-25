import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { dashboardApi, presenceApi, attendanceApi } from '../api/client';
import { 
  CheckCircle2, Clock, AlertTriangle, ListTodo, Calendar, 
  TrendingUp, Award, ArrowUpRight, ChevronDown, 
  Building, RefreshCw, AlertCircle, Users, UserCheck, Shield, Sparkles, Wifi,
  CalendarCheck, LogIn, LogOut, Utensils, Coffee, Check
} from 'lucide-react';

export const DashboardPage = ({ onNavigate }) => {
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [selectedDept, setSelectedDept] = useState(() => {
    return user?.department || 'Ingage';
  });
  const [dutyStatus, setDutyStatus] = useState('On Duty');

  // Role detection for Attendance permissions
  const userRoleNorm = (user?.role || '').toLowerCase().replace(' ', '_');
  const isSuperAdmin = userRoleNorm === 'super_admin' || userRoleNorm === 'superadmin';
  const isAdmin = userRoleNorm === 'admin';
  const isSuperAdminOrAdmin = isSuperAdmin || isAdmin;

  // Attendance & Dynamic Check-in State
  const [todayAttendance, setTodayAttendance] = useState(null);
  const [isSaturdayWorking, setIsSaturdayWorking] = useState(false);
  const [markingAttendance, setMarkingAttendance] = useState(false);
  const [togglingSaturday, setTogglingSaturday] = useState(false);
  const [attendanceMsg, setAttendanceMsg] = useState('');

  const fetchTodayAttendance = async () => {
    try {
      const res = await attendanceApi.getToday();
      setTodayAttendance(res.data);
      if (res.data.is_saturday_working !== undefined) {
        setIsSaturdayWorking(res.data.is_saturday_working);
      }
    } catch (err) {
      console.error('Failed to load today attendance in Dashboard:', err);
    }
  };

  const handleMarkPunch = async (action) => {
    if (!action || isSuperAdmin) return;
    try {
      setMarkingAttendance(true);
      setAttendanceMsg('');
      const res = await attendanceApi.markAttendance(action);
      setAttendanceMsg(res.data.message || 'Attendance recorded successfully!');
      await fetchTodayAttendance();
      setTimeout(() => setAttendanceMsg(''), 4500);
    } catch (err) {
      const errorMsg = err.response?.data?.detail || 'Failed to mark attendance';
      setAttendanceMsg(errorMsg);
      setTimeout(() => setAttendanceMsg(''), 4500);
    } finally {
      setMarkingAttendance(false);
    }
  };

  const handleToggleSaturday = async () => {
    if (!isSuperAdminOrAdmin) return;
    try {
      setTogglingSaturday(true);
      const nextState = !isSaturdayWorking;
      const res = await attendanceApi.toggleSaturday(nextState);
      setIsSaturdayWorking(nextState);
      setAttendanceMsg(res.data.message || 'Saturday office setting updated.');
      setTimeout(() => setAttendanceMsg(''), 4000);
    } catch (err) {
      console.error('Failed to toggle Saturday:', err);
      setAttendanceMsg(err.response?.data?.detail || 'Failed to toggle Saturday setting.');
      setTimeout(() => setAttendanceMsg(''), 4000);
    } finally {
      setTogglingSaturday(false);
    }
  };

  const handleNavigateWithFilter = (status) => {
    if (status) {
      try {
        sessionStorage.setItem('tasks_filter_status', status);
      } catch {
        // ignore
      }
    }
    if (onNavigate) {
      onNavigate('tasks');
    }
  };

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await dashboardApi.getStats();
      setStats(res.data);
      if (res.data.current_status) {
        setDutyStatus(res.data.current_status);
      }
      if (res.data.department) {
        setSelectedDept(res.data.department);
      }
    } catch (err) {
      console.error('Failed to load dashboard stats:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStats();
    fetchTodayAttendance();
  }, [user]);

  // Today's formatted display date ("Everyday" representation)
  const todayFormattedDate = useMemo(() => {
    if (todayAttendance?.today_formatted) {
      return todayAttendance.today_formatted;
    }
    const now = new Date();
    return now.toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  }, [todayAttendance]);

  // Dynamic session punch action:
  // 1st: Check-in (9:30 AM to 11:30 AM)
  // 2nd: Lunch (12:00 PM to 4:30 PM)
  // 3rd: Break (5:00 PM to 6:15 PM)
  // 4th / Final: Check-out (6:30 PM to 8:30 PM)
  // Monday to Friday (and Saturday if isSaturdayWorking is enabled)
  const dynamicAction = useMemo(() => {
    const now = new Date();
    const day = now.getDay(); // 0 = Sun, 6 = Sat
    const hours = now.getHours();
    const minutes = now.getMinutes();
    const curMinutes = hours * 60 + minutes;

    const t930 = 9 * 60 + 30;    // 570 (9:30 AM)
    const t1130 = 11 * 60 + 30;  // 690 (11:30 AM)
    const t1200 = 12 * 60;       // 720 (12:00 PM)
    const t1630 = 16 * 60 + 30;  // 990 (4:30 PM)
    const t1700 = 17 * 60;       // 1020 (5:00 PM)
    const t1815 = 18 * 60 + 15;  // 1095 (6:15 PM)
    const t1830 = 18 * 60 + 30;  // 1110 (6:30 PM)
    const t2030 = 20 * 60 + 30;  // 1230 (8:30 PM)

    const rec = todayAttendance?.record;

    if (day === 0) {
      return {
        label: 'Sunday (Office Closed)',
        action: null,
        sessionName: 'Sunday Off',
        window: 'Office Closed',
        disabled: true,
        icon: Calendar,
        btnColor: 'bg-slate-100 text-slate-500 border-slate-200'
      };
    }

    if (day === 6 && !isSaturdayWorking) {
      return {
        label: 'Saturday (Office Off)',
        action: null,
        sessionName: 'Optional Saturday',
        window: 'Office Closed',
        disabled: true,
        icon: Calendar,
        btnColor: 'bg-amber-50 text-amber-700 border-amber-200'
      };
    }

    // 1st: Check-in (9:30 AM to 11:30 AM)
    if (curMinutes <= t1130 || !rec?.check_in) {
      if (rec?.check_in) {
        return {
          label: `Checked In (${rec.check_in})`,
          action: null,
          sessionName: 'Check-in',
          window: '9:30 AM - 11:30 AM',
          disabled: true,
          completed: true,
          icon: CheckCircle2,
          btnColor: 'bg-emerald-50 text-emerald-700 border border-emerald-300'
        };
      }
      return {
        label: curMinutes < t930 ? 'Check-in (Early)' : 'Check-in',
        action: 'check_in',
        sessionName: 'Check-in',
        window: '9:30 AM - 11:30 AM',
        disabled: false,
        icon: LogIn,
        btnColor: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs'
      };
    }

    // 2nd: Lunch (12:00 PM to 4:30 PM)
    if (curMinutes >= t1200 && curMinutes <= t1630) {
      if (!rec?.lunch_start) {
        return {
          label: 'Lunch Check-in',
          action: 'lunch',
          sessionName: 'Lunch',
          window: '12:00 PM - 4:30 PM',
          disabled: false,
          icon: Utensils,
          btnColor: 'bg-amber-600 hover:bg-amber-700 text-white shadow-xs'
        };
      }
      if (!rec?.lunch_end) {
        return {
          label: 'Resume from Lunch',
          action: 'lunch',
          sessionName: 'Lunch in Progress',
          window: '12:00 PM - 4:30 PM',
          disabled: false,
          icon: Utensils,
          btnColor: 'bg-amber-500 hover:bg-amber-600 text-white shadow-xs'
        };
      }
      return {
        label: `Lunch Done (${rec.lunch_end})`,
        action: null,
        sessionName: 'Lunch',
        window: '12:00 PM - 4:30 PM',
        disabled: true,
        completed: true,
        icon: CheckCircle2,
        btnColor: 'bg-amber-50 text-amber-700 border border-amber-300'
      };
    }

    // 3rd: Break (5:00 PM to 6:15 PM)
    if (curMinutes >= t1700 && curMinutes <= t1815) {
      if (!rec?.break_start) {
        return {
          label: 'Start Break',
          action: 'break',
          sessionName: 'Break',
          window: '5:00 PM - 6:15 PM',
          disabled: false,
          icon: Coffee,
          btnColor: 'bg-purple-600 hover:bg-purple-700 text-white shadow-xs'
        };
      }
      if (!rec?.break_end) {
        return {
          label: 'Resume from Break',
          action: 'break',
          sessionName: 'Break in Progress',
          window: '5:00 PM - 6:15 PM',
          disabled: false,
          icon: Coffee,
          btnColor: 'bg-purple-500 hover:bg-purple-600 text-white shadow-xs'
        };
      }
      return {
        label: `Break Done (${rec.break_end})`,
        action: null,
        sessionName: 'Break',
        window: '5:00 PM - 6:15 PM',
        disabled: true,
        completed: true,
        icon: CheckCircle2,
        btnColor: 'bg-purple-50 text-purple-700 border border-purple-300'
      };
    }

    // 4th / Final: Check-out (6:30 PM to 8:30 PM)
    if (curMinutes >= t1830) {
      if (rec?.check_out) {
        return {
          label: `Checked Out (${rec.check_out})`,
          action: null,
          sessionName: 'Check-out',
          window: '6:30 PM - 8:30 PM',
          disabled: true,
          completed: true,
          icon: CheckCircle2,
          btnColor: 'bg-slate-100 text-slate-700 border border-slate-300'
        };
      }
      return {
        label: 'Check-out',
        action: 'check_out',
        sessionName: 'Check-out',
        window: '6:30 PM - 8:30 PM',
        disabled: false,
        icon: LogOut,
        btnColor: 'bg-rose-600 hover:bg-rose-700 text-white shadow-xs'
      };
    }

    // Between sessions (11:30-12:00, 16:30-17:00, 18:15-18:30)
    let nextInfo = 'Working Session';
    if (curMinutes < t1200) nextInfo = 'Lunch at 12:00 PM';
    else if (curMinutes < t1700) nextInfo = 'Break at 5:00 PM';
    else if (curMinutes < t1830) nextInfo = 'Check-out at 6:30 PM';

    return {
      label: `On Duty • Next: ${nextInfo}`,
      action: null,
      sessionName: 'Active Work',
      window: nextInfo,
      disabled: true,
      icon: Clock,
      btnColor: 'bg-blue-50 text-blue-700 border border-blue-200'
    };
  }, [todayAttendance, isSaturdayWorking]);

  // Sort recent tasks in reverse chronological order with respect to due date (latest due date first)
  const sortedRecentTasks = useMemo(() => {
    if (!stats?.recent_tasks) return [];
    return [...stats.recent_tasks].sort((a, b) => {
      const timeA = a.due_date ? new Date(a.due_date).getTime() : -Infinity;
      const timeB = b.due_date ? new Date(b.due_date).getTime() : -Infinity;
      if (timeB !== timeA) {
        return timeB - timeA;
      }
      return (b.id || 0) - (a.id || 0);
    });
  }, [stats?.recent_tasks]);

  const workCounts = stats?.work_counts || {
    completed: 0,
    in_progress: 0,
    under_review: 0,
    overdue: 0,
    total: 0,
    completion_rate: 0,
  };

  const getPriorityColor = (p) => {
    switch (p?.toLowerCase()) {
      case 'critical': return 'bg-rose-100 text-rose-700 border-rose-200';
      case 'high': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'medium': return 'bg-blue-100 text-blue-700 border-blue-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const getStatusColor = (s) => {
    switch (s?.toLowerCase()) {
      case 'completed': return 'bg-emerald-100 text-emerald-800';
      case 'in progress': return 'bg-brand-100 text-brand-800';
      case 'overdue': return 'bg-rose-100 text-rose-800 animate-pulse';
      case 'under review': return 'bg-purple-100 text-purple-800';
      default: return 'bg-slate-100 text-slate-800';
    }
  };

  // "Team Members Availability & Successor Accounts" disappears while roles are "intern", rest of the roles appear it
  const userRole = (user?.role || '').toLowerCase().replace(' ', '_');
  const isIntern = userRole === 'intern' || (user?.designation && user.designation.toLowerCase().includes('intern'));
  const canSeeTeamAvailability = !isIntern; // Disappears for intern, appears for rest (Super Admin, Admin, Team Lead, HR)
  const isHR = userRole === 'hr' || userRole === 'human_resource_manager' || (user?.email === 'hr@ingage.com') || (user?.designation && user.designation.toLowerCase().includes('human resource'));

  const [livePresenceMap, setLivePresenceMap] = useState({});
  const [wsConnected, setWsConnected] = useState(false);
  const socketRef = useRef(null);

  // 8-Minute Periodic Employee Availability Service
  const EIGHT_MIN_SECONDS = 8 * 60; // 480 seconds (every 8 min)
  const [serviceSecondsRemaining, setServiceSecondsRemaining] = useState(EIGHT_MIN_SECONDS);
  const [lastServiceTime, setLastServiceTime] = useState(new Date());
  const [isServiceRunning, setIsServiceRunning] = useState(false);
  const [serviceNotice, setServiceNotice] = useState(null);

  const triggerEightMinService = async (isManual = false) => {
    try {
      setIsServiceRunning(true);
      // 1. Hit the backend periodic service endpoint
      await presenceApi.checkService().catch(() => {});
      // 2. Ping WebSocket if active
      if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
        socketRef.current.send(JSON.stringify({ type: 'service_verify' }));
      }
      // 3. Refresh live stats
      await fetchStats();
      setLastServiceTime(new Date());
      setServiceSecondsRemaining(EIGHT_MIN_SECONDS);
      setServiceNotice(isManual ? 'Manual 8-Min Service Check executed: Duty availability verified.' : '8-Min Periodic Service executed: Duty availability updated.');
      setTimeout(() => setServiceNotice(null), 4000);
    } catch (err) {
      console.error('8-Min Service error:', err);
    } finally {
      setIsServiceRunning(false);
    }
  };

  // 8-Minute countdown timer (triggers service check every 8 minutes)
  useEffect(() => {
    if (!canSeeTeamAvailability) return;
    const timer = setInterval(() => {
      setServiceSecondsRemaining((prev) => {
        if (prev <= 1) {
          triggerEightMinService(false);
          return EIGHT_MIN_SECONDS;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [canSeeTeamAvailability]);

  const formatCountdown = (totalSec) => {
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Real-time WebSocket connection to verify employee availability live
  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) return;

    let socket = null;
    let reconnectTimer = null;
    let shouldReconnect = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/presence?token=${encodeURIComponent(token)}`;

    const connectWs = () => {
      try {
        socket = new WebSocket(wsUrl);
        socketRef.current = socket;
        socket.onopen = () => {
          setWsConnected(true);
        };
        socket.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'presence_init' && Array.isArray(data.online_user_ids)) {
              const initMap = {};
              data.online_user_ids.forEach((uid) => {
                initMap[uid] = { is_available: true, availability_status: 'Available' };
              });
              setLivePresenceMap(initMap);
            } else if (data.type === 'presence_update') {
              setLivePresenceMap((prev) => ({
                ...prev,
                [data.user_id]: {
                  is_available: data.is_available,
                  availability_status: data.availability_status,
                },
              }));
            } else if (data.type === 'presence_service_cycle' && Array.isArray(data.online_user_ids)) {
              const cycleMap = {};
              data.online_user_ids.forEach((uid) => {
                cycleMap[uid] = { is_available: true, availability_status: 'Available' };
              });
              setLivePresenceMap((prev) => ({ ...prev, ...cycleMap }));
              setLastServiceTime(new Date());
              setServiceNotice('8-Min Service Broadcast: Employee duty availability verified live.');
              setTimeout(() => setServiceNotice(null), 3500);
            }
          } catch {
            // ignore non-json messages
          }
        };
        socket.onclose = () => {
          setWsConnected(false);
          socketRef.current = null;
          if (shouldReconnect) {
            reconnectTimer = setTimeout(connectWs, 3500);
          }
        };
        socket.onerror = () => {
          socket?.close();
        };
      } catch (err) {
        // ignore connection failure
      }
    };

    connectWs();

    return () => {
      shouldReconnect = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (socket) socket.close();
      socketRef.current = null;
    };
  }, []);

  // Top-Bottom Order Format: Merge live WebSocket presence and sort Available at TOP, NA at BOTTOM
  const sortedTeamMembers = useMemo(() => {
    const rawList = stats?.team_members || [];
    const merged = rawList.map((member) => {
      const live = livePresenceMap[member.id];
      if (live !== undefined) {
        return {
          ...member,
          is_available: live.is_available,
          availability_status: live.availability_status,
        };
      }
      return member;
    });

    // Top-to-bottom sort: Available (is_available === true) first at TOP, NA (is_available === false) at BOTTOM
    return [...merged].sort((a, b) => {
      if (a.is_available && !b.is_available) return -1;
      if (!a.is_available && b.is_available) return 1;
      return (a.full_name || '').localeCompare(b.full_name || '');
    });
  }, [stats?.team_members, livePresenceMap]);

  const onlineMembersCount = useMemo(() => {
    return sortedTeamMembers.filter((m) => m.is_available).length;
  }, [sortedTeamMembers]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* ================= 1. WELCOME HERO (Matches theme-colour.png) ================= */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              Welcome back, {user?.full_name || 'User'}
            </h1>
            {/* <p className="text-sm text-slate-500 mt-1 font-normal">
              Here's your workspace overview for{' '}
              <span className="font-semibold text-slate-700 capitalize">
                {user?.role?.replace('_', ' ')} Designation
              </span>
            </p> */}
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => onNavigate && onNavigate('tasks')}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer flex items-center space-x-2"
            >
              <span>Go to My Tasks</span>
              <ArrowUpRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Top 3 Quick Stats Row (Matches theme-colour.png layout) */}
          {/* Total Weekly Hours (theme-colour.png: Light green card) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
          {/* <div className="p-5 rounded-2xl bg-[#f4faed] border border-[#d9f0c2]">
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">
              Total Weekly Hours
            </p>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900">
                {stats?.weekly_hours ? `${stats.weekly_hours.toFixed(2)}h` : '24.00h'}
              </span>
            </div>
            <div className="flex items-center justify-between text-xs text-slate-600 mt-2">
              <span>Overtime hours</span>
              <span className="font-semibold text-slate-800">0</span>
            </div>
          </div> */}

          {/* Current Status (theme-colour.png: Status card) */}
          <div className="p-5 rounded-2xl bg-[#eff8ea] border border-[#d2ebbe]">
            <p className="text-xs font-bold text-brand-700 uppercase tracking-wider">
              Current Status
            </p>
            <div className="flex items-center space-x-2 mt-1">
              <span className="inline-block w-3 h-3 rounded-full bg-brand-600 animate-pulse" />
              <span className="text-3xl font-extrabold text-slate-800">{dutyStatus}</span>
            </div>
            {/* <p className="text-xs text-slate-500 mt-2">
              Assigned Department: <span className="font-semibold text-slate-700">{selectedDept}</span>
            </p> */}
          </div>

          {/* Expected Pay / Workload (theme-colour.png: Light blue card) */}
          <div className="p-5 rounded-2xl bg-[#f0f7ff] border border-[#d4e6ff]">
            <p className="text-xs font-bold text-blue-700 uppercase tracking-wider">
              Workload Metric
            </p>
            <div className="flex items-baseline space-x-2 mt-2">
              <span className="text-3xl font-extrabold text-slate-900">
                {workCounts.completion_rate}%
              </span>
              <span className="text-xs text-slate-500 font-medium">Completion Rate</span>
            </div>
            {/* <p className="text-xs text-slate-500 mt-2">
              Across <span className="font-semibold text-slate-700">Department</span> ({selectedDept})
            </p> */}
          </div>

          {/* Attendance & Dynamic Check-in Card (Split in 2 Parts: Part 1 Attendance & Everyday Date, Part 2 Check-in Dynamic Button) */}
          <div className="p-5 rounded-2xl bg-[#f0faf5] border border-[#c7ebd7] flex flex-col justify-between">
            {/* Part 1: Top: "Attendance", Bottom: "Everyday • [Today's Date]" */}
            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold text-emerald-800 uppercase tracking-wider flex items-center space-x-1.5">
                  <CalendarCheck className="w-4 h-4 text-emerald-600" />
                  <span>Attendance</span>
                </p>
                {onNavigate && (
                  <button
                    onClick={() => onNavigate('attendance')}
                    className="text-xs font-semibold text-emerald-700 hover:text-emerald-900 hover:underline flex items-center space-x-1 cursor-pointer"
                    title="View Full Attendance Ledger"
                  >
                    <span>Ledger</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              <div className="mt-2 flex items-baseline justify-between">
                <div>
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider block">
                    Everyday
                  </span>
                  <span className="text-xl font-extrabold text-slate-800 block">
                    {todayFormattedDate}
                  </span>
                </div>
                {todayAttendance?.active_session?.session_name && (
                  <span className="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-emerald-100/80 text-emerald-800 border border-emerald-200">
                    {todayAttendance.active_session.session_name}
                  </span>
                )}
              </div>
            </div>

            {/* Part 2: Dynamic Check-in Button (Except Superadmin) */}
            <div className="mt-3 pt-3 border-t border-emerald-100">
              {isSuperAdmin ? (
                <div className="flex items-center justify-between py-1">
                  <div className="flex items-center space-x-1.5 text-xs font-semibold text-amber-800 bg-amber-50 px-2.5 py-1 rounded-lg border border-amber-200">
                    <Shield className="w-3.5 h-3.5 text-amber-600" />
                    <span>Super Admin Exempt</span>
                  </div>
                  {onNavigate && (
                    <button
                      onClick={() => onNavigate('attendance')}
                      className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
                    >
                      Team Attendance
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    onClick={() => dynamicAction.action && handleMarkPunch(dynamicAction.action)}
                    disabled={dynamicAction.disabled || markingAttendance}
                    className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center space-x-2 transition-all cursor-pointer ${dynamicAction.btnColor} ${
                      dynamicAction.disabled ? 'opacity-85 cursor-not-allowed' : 'active:scale-98 cursor-pointer'
                    }`}
                  >
                    {markingAttendance ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        <span>Recording Punch...</span>
                      </>
                    ) : (
                      <>
                        <dynamicAction.icon className="w-3.5 h-3.5" />
                        <span>{dynamicAction.label}</span>
                      </>
                    )}
                  </button>
                  {attendanceMsg && (
                    <p className="text-[11px] font-medium text-emerald-700 text-center animate-fade-in">
                      {attendanceMsg}
                    </p>
                  )}
                </div>
              )}

              {/* Saturday Optional Office Toggle (Tick button, exclusively for Admin and Superadmin) */}
              {isSuperAdminOrAdmin && (
                <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-emerald-100/70 text-xs">
                  <span className="text-slate-600 font-medium text-[11px]">Saturday Office:</span>
                  <button
                    onClick={handleToggleSaturday}
                    disabled={togglingSaturday}
                    className={`flex items-center space-x-1.5 px-2 py-0.5 rounded-md border text-[11px] font-semibold transition-all cursor-pointer ${
                      isSaturdayWorking
                        ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                        : 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                    }`}
                    title="Tick button to toggle Saturday office working status"
                  >
                    <div
                      className={`w-3.5 h-3.5 rounded flex items-center justify-center transition-colors ${
                        isSaturdayWorking ? 'bg-emerald-600 text-white' : 'border border-slate-400 bg-white'
                      }`}
                    >
                      {isSaturdayWorking && <Check className="w-2.5 h-2.5" />}
                    </div>
                    <span>{isSaturdayWorking ? 'Working' : 'Optional (Off)'}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ================= 2. PAGE 1 EXPLICIT REQUIREMENT: WORK COUNT COMPLETION, IN PROGRESS, OVERDUE ================= */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <span>Task Count Analytics</span>
              {/* <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
                {user?.role === 'intern' ? 'For Intern Designation' : 'Hierarchical Overview'}
              </span> */}
            </h2>
            {/* <p className="text-xs text-slate-500">
              Real-time work counts tracked under designated hierarchy.
            </p> */}
          </div>
          <button
            onClick={fetchStats}
            className="text-xs text-slate-500 hover:text-brand-600 p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors flex items-center space-x-1"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 4 Metric Cards: Completed, In Progress, Under Review, Overdue */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1. Work Count Completion */}
          <div 
            onClick={() => handleNavigateWithFilter('Completed')}
            className="bg-white rounded-2xl p-5 border-2 border-emerald-200 hover:border-emerald-400 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 flex items-center space-x-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>Task Count: Completed</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                100% Done
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-extrabold text-slate-900 group-hover:text-emerald-700 transition-colors">
                {workCounts.completed}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                of {workCounts.total} total tasks
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
              <div 
                className="bg-emerald-500 h-2 rounded-full transition-all duration-500"
                style={{ width: `${workCounts.completion_rate}%` }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-between">
              <span>Verified & Approved</span>
              <span className="text-emerald-600 font-semibold">{workCounts.completion_rate}% Completed</span>
            </p>
          </div>

          {/* 2. Work Count: In Progress */}
          <div 
            onClick={() => handleNavigateWithFilter('In Progress')}
            className="bg-white rounded-2xl p-5 border-2 border-brand-200 hover:border-brand-400 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 flex items-center space-x-1.5">
                <Clock className="w-4 h-4 text-brand-600" />
                <span>Task Count: In Progress</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-100 text-brand-800">
                Active Tasks
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-extrabold text-slate-900 group-hover:text-brand-700 transition-colors">
                {workCounts.in_progress}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                {workCounts.in_progress === 1 ? 'task underway' : 'tasks underway'}
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
              <div 
                className="bg-brand-500 h-2 rounded-full transition-all duration-500"
                style={{ 
                  width: `${workCounts.total > 0 ? (workCounts.in_progress / workCounts.total * 100) : 0}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-between">
              <span>Actively in progression</span>
              <span className="text-brand-600 font-semibold">Underway</span>
            </p>
          </div>

          {/* 3. Work Count: Under Review */}
          <div 
            onClick={() => handleNavigateWithFilter('Under Review')}
            className="bg-white rounded-2xl p-5 border-2 border-purple-200 hover:border-purple-400 shadow-2xs hover:shadow-md transition-all cursor-pointer group"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-purple-700 flex items-center space-x-1.5">
                <Award className="w-4 h-4 text-purple-600" />
                <span>Task Count: Under Review</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-purple-100 text-purple-800">
                Review Stage
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-extrabold text-slate-900 group-hover:text-purple-700 transition-colors">
                {workCounts.under_review || 0}
              </span>
              <span className="text-xs text-slate-500 font-medium">
                awaiting review
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
              <div 
                className="bg-purple-500 h-2 rounded-full transition-all duration-500"
                style={{ 
                  width: `${workCounts.total > 0 ? ((workCounts.under_review || 0) / workCounts.total * 100) : 0}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-slate-500 mt-3 flex items-center justify-between">
              <span>Submitted for approval</span>
              <span className="text-purple-600 font-semibold">Pending Review</span>
            </p>
          </div>

          {/* 4. Work Count: Overdue (Highlighted Alert Style) */}
          <div 
            onClick={() => handleNavigateWithFilter('Overdue')}
            className="bg-white rounded-2xl p-5 border-2 border-rose-300 hover:border-rose-500 shadow-2xs hover:shadow-md transition-all cursor-pointer group bg-gradient-to-b from-white to-rose-50/40"
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-700 flex items-center space-x-1.5">
                <AlertTriangle className="w-4 h-4 text-rose-600 animate-bounce" />
                <span>Task Count: Overdue</span>
              </span>
              <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
                {workCounts.overdue > 0 ? 'Attention' : 'On Track'}
              </span>
            </div>
            <div className="flex items-baseline justify-between mt-2">
              <span className="text-4xl font-extrabold text-rose-600 group-hover:scale-105 transition-transform">
                {workCounts.overdue}
              </span>
              <span className="text-xs text-rose-600 font-medium">
                past deadline
              </span>
            </div>
            {/* Progress bar */}
            <div className="w-full bg-slate-100 rounded-full h-2 mt-4 overflow-hidden">
              <div 
                className="bg-rose-500 h-2 rounded-full transition-all duration-500"
                style={{ 
                  width: `${workCounts.total > 0 ? (workCounts.overdue / workCounts.total * 100) : 0}%` 
                }}
              />
            </div>
            <p className="text-[11px] text-rose-600 mt-3 flex items-center justify-between font-medium">
              <span>{workCounts.overdue > 0 ? 'Requires immediate completion' : 'No overdue items'}</span>
              <span>{workCounts.overdue > 0 ? 'Needs escalation' : 'Healthy status'}</span>
            </p>
          </div>
        </div>
      </div>

      {/* ================= 3. LOWER SECTION (Matches theme-colour.png) ================= */}
        {/* Left 2 Cols: Time Clock & Department + Recent Tasks */}
          {/* Time Clock & Select Department (theme-colour.png: exact green bar and select dropdown) */}
            {/* Green Title Bar */}
            {/* Select Department Selector */}
      {/* Department Highlight Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {/* <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs space-y-4">
            <div className="p-3 bg-[#eff8ea] text-brand-800 font-semibold text-sm rounded-xl flex items-center space-x-2 border border-[#d2ebbe]">
              <Clock className="w-4 h-4 text-brand-600" />
              <span>Time Clock</span>
            </div>

            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-sm font-semibold text-slate-800 flex items-center space-x-2">
                  <Building className="w-4 h-4 text-slate-400" />
                  <span>Select Department</span>
                </label>
                <span className="text-[11px] bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full font-medium">
                  3 Available
                </span>
              </div>
              <div className="relative">
                <select
                  value={selectedDept}
                  onChange={(e) => setSelectedDept(e.target.value)}
                  className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-medium text-slate-800 appearance-none focus:outline-none focus:ring-2 focus:ring-brand-500 cursor-pointer"
                >
                  <option value="Ingage">Ingage Internal</option>
                  <option value="Edutech">Edutech Division</option>
                  <option value="Rezov">Rezov Analytics</option>
                </select>
                <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-3.5 pointer-events-none" />
              </div>
            </div>

            <div className="p-3 bg-[#f4faed] text-brand-900 font-semibold text-sm rounded-xl border border-[#d9f0c2] flex items-center justify-between">
              <span>{selectedDept}</span>
              <span className="text-xs font-normal text-brand-700">Active Division</span>
            </div>
          </div> */}

          {/* Recent Tasks List */}
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
                <ListTodo className="w-4 h-4 text-brand-600" />
                <span>Recent Tasks Under Your Responsibility</span>
              </h3>
              <button
                onClick={() => onNavigate && onNavigate('tasks')}
                className="text-xs text-brand-600 hover:text-brand-700 font-semibold hover:underline"
              >
                View all tasks →
              </button>
            </div>

            <div className="divide-y divide-slate-100">
              {sortedRecentTasks.length === 0 ? (
                <p className="py-6 text-center text-xs text-slate-400">No tasks currently assigned</p>
              ) : (
                sortedRecentTasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => onNavigate && onNavigate('tasks')}
                    className="py-3 flex items-center justify-between hover:bg-slate-50 px-2 rounded-lg transition-colors cursor-pointer"
                  >
                    <div className="flex items-center space-x-3 min-w-0 pr-4">
                      <div className="shrink-0">
                        {task.status === 'Completed' ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : task.status === 'Overdue' ? (
                          <AlertCircle className="w-4 h-4 text-rose-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-brand-600" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-800 truncate">{task.title}</p>
                        <p className="text-xs text-slate-400 truncate">
                          Due: {task.due_date ? new Date(task.due_date).toLocaleDateString() : 'No date'} • Assigned by {task.assigned_by_name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center space-x-2 shrink-0">
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${getPriorityColor(task.priority)}`}>
                        {task.priority}
                      </span>
                      <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Schedule & Time Sheets (theme-colour.png right sidebar cards) */}
        {/* Time Sheets Card */} 
          {/* Schedule Card */}
        <div className="space-y-6">
          {/* <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm mb-2">
              <Calendar className="w-4 h-4 text-brand-600" />
              <span>Schedule</span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-5">
              View and manage your work schedule. Plan your shifts and keep track of your working hours efficiently.
            </p>
            <button
              onClick={() => onNavigate && onNavigate('tasks')}
              className="w-full py-2.5 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-xl transition-all shadow-xs hover:shadow-md cursor-pointer text-center block"
            >
              View Schedule
            </button>
          </div>

         
          <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-2xs">
            <div className="flex items-center space-x-2 text-slate-800 font-bold text-sm mb-2">
              <TrendingUp className="w-4 h-4 text-brand-600" />
              <span>Time Sheets  </span>
            </div>
            <p className="text-xs text-slate-500 leading-relaxed mb-4">
              Review and submit time sheets. Track your working hours and manage your time records with ease.
            </p>
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Current Week Log:</span>
                <span className="font-semibold text-slate-800">24.0 / 40.0 hrs</span>
              </div>
              <div className="flex justify-between">
                <span>Approval Status:</span>
                <span className="font-semibold text-emerald-600">
                  {user?.role === 'hr' || (user?.designation && user.designation.toLowerCase().includes('human resource'))
                    ? 'Approved by Admin (Director)'
                    : user?.role === 'intern'
                    ? 'Approved by Lead'
                    : 'Verified & Certified'}
                </span>
              </div>
            </div>
          </div> */}

          {/* ================= SUCCESSORS & REPORTING SUBORDINATES / DUTY AVAILABILITY (Presented below Time Sheets for Each Role) ================= */}
          {canSeeTeamAvailability && (
            <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs space-y-4">
            {/* Header */}
            <div className="pb-3 border-b border-slate-100">
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <div className="flex items-center space-x-2">
                  <div className="w-7 h-7 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center shrink-0">
                    <Users className="w-4 h-4" />
                  </div>
                  <h3 className="text-sm font-bold text-slate-900 leading-tight">
                    Employee Availability
                  </h3>
                </div>
                {/* <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 shrink-0">
                  {isHR
                    ? (sortedTeamMembers.length > 0 ? `Successors: ${sortedTeamMembers.length}` : 'Successors & Reporting Subordinate: 0')
                    : (stats?.successor_account_available === 'Available' ? 'Successors: Available' : (sortedTeamMembers.length > 0 ? 'Successors: Available' : 'Successors: NA'))}
                </span> */}
              </div>
              {/* <p className="text-[11px] text-slate-500">
                {isHR
                  ? 'Hierarchy flow: (super_admin → hr) or (super_admin → hr → hr_intern). Successor count does not align with all tasks.'
                  : 'Real-time WebSocket verified duty availability in top-to-bottom order format (Available at top, NA at bottom).'}
              </p> */}

              {/* 8-Minute Periodic Service Control Bar */}
              <div className="mt-3 p-3 bg-gradient-to-r from-slate-50 via-brand-50/40 to-slate-50 rounded-xl border border-brand-200/60 flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center space-x-2">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
                  </span>
                  <div className="text-[11px] font-semibold text-slate-800">
                    <span>8-Min Availability Service: </span>
                    <span className="font-bold text-brand-700 font-mono">
                      Next in {formatCountdown(serviceSecondsRemaining)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-[10px] text-slate-500 hidden sm:inline">
                    Last Hit: {lastServiceTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                  </span>
                  <button
                    type="button"
                    onClick={() => triggerEightMinService(true)}
                    disabled={isServiceRunning}
                    className="px-2.5 py-1 rounded-lg bg-white hover:bg-brand-50 text-brand-700 border border-brand-200 text-[11px] font-bold shadow-2xs transition-all flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                    title="Hit the 8-minute duty availability check service now"
                  >
                    <RefreshCw className={`w-3 h-3 ${isServiceRunning ? 'animate-spin text-brand-600' : 'text-brand-600'}`} />
                    <span>{isServiceRunning ? 'Verifying...' : 'Hit Service Now'}</span>
                  </button>
                </div>
              </div>

              {serviceNotice && (
                <div className="mt-2 p-2 bg-emerald-50 rounded-lg border border-emerald-200 text-[11px] text-emerald-800 font-medium flex items-center space-x-1.5 animate-in fade-in duration-150">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>{serviceNotice}</span>
                </div>
              )}

              {/* Specific Hierarchy Flow for HR */}
              {isHR && (
                // <div className="mt-3 p-3.5 bg-gradient-to-r from-purple-50 via-slate-50 to-emerald-50 rounded-xl border border-purple-200/80 text-xs space-y-2">
                //   <div className="flex items-center justify-between">
                //     <span className="font-bold text-slate-700 flex items-center space-x-1.5">
                //       <Shield className="w-3.5 h-3.5 text-purple-600" />
                //       <span>Hierarchy Flow</span>
                //     </span>
                //     <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-white text-purple-700 border border-purple-200 font-bold shadow-2xs">
                //       {sortedTeamMembers.length > 0 ? 'super_admin → hr → hr_intern' : 'super_admin → hr'}
                //     </span>
                //   </div>
                //   <div className="flex items-center space-x-2 text-xs font-semibold">
                //     <span className="px-2.5 py-1 rounded-lg bg-purple-100 text-purple-800 border border-purple-200">
                //       Super Admin (Elizabeth Reed)
                //     </span>
                //     <span className="text-slate-400 font-bold">→</span>
                //     <span className="px-2.5 py-1 rounded-lg bg-emerald-100 text-emerald-800 border border-emerald-200">
                //       HR Manager (Meera Raman)
                //     </span>
                //     {sortedTeamMembers.length > 0 && (
                //       <>
                //         <span className="text-slate-400 font-bold">→</span>
                //         <span className="px-2.5 py-1 rounded-lg bg-blue-100 text-blue-800 border border-blue-200">
                //           HR Intern ({sortedTeamMembers.length})
                //         </span>
                //       </>
                //     )}
                //   </div>
                //   <p className="text-[11px] text-slate-500 leading-relaxed">
                //     While logged in as <strong>hr@ingage.com</strong>, the successor count aligns strictly with <strong>(super_admin → hr)</strong>, <strong>(super_admin → hr → hr_intern)</strong>, or <strong>(super_admin → any_roles_relate_with_hr)</strong>. It does <strong>not align with all tasks</strong>. Zero correlation with engineering interns, team leads, or admins.
                //   </p>
                // </div>
                <div/>
              )}

              {/* Metrics Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                {/* <div className={`px-2 py-0.5 rounded-lg text-[10px] font-semibold flex items-center space-x-1 border ${
                  wsConnected ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  <Wifi className={`w-3 h-3 ${wsConnected ? 'text-emerald-600' : 'text-slate-400'}`} />
                  <span>{wsConnected ? 'WebSocket Live' : 'WebSocket Ready'}</span>
                </div> */}

                {/* <div className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
                  <span className="text-slate-500 font-medium">Predecessor: </span>
                  <span className="font-bold text-slate-900">{stats?.predecessor_name || (isHR ? 'Super Admin' : 'Super Admin')}</span>
                </div> */}

                <div className="px-2 py-0.5 rounded-lg bg-slate-50 border border-slate-200 text-[10px]">
                  <span className="text-slate-500 font-medium">Count: </span>
                  <span className="font-bold text-slate-900">
                    {isHR ? (sortedTeamMembers.length > 0 ? String(sortedTeamMembers.length) : '0') : (stats?.employee_count || (sortedTeamMembers.length > 0 ? String(sortedTeamMembers.length) : 'NA'))}
                  </span>
                </div>

                <div className="px-2 py-0.5 rounded-lg bg-emerald-50 border border-emerald-200 text-[10px] flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-emerald-800 font-bold">
                    {onlineMembersCount} Available
                  </span>
                </div>

                <div className="px-2 py-0.5 rounded-lg bg-slate-100 border border-slate-200 text-[10px] text-slate-600 font-bold">
                  {Math.max(0, sortedTeamMembers.length - onlineMembersCount)} NA
                </div>

                {isHR && sortedTeamMembers.length === 0 && (
                  <div className="px-2 py-0.5 rounded-lg bg-purple-50 border border-purple-200 text-[10px] text-purple-700 font-bold">
                    Successors &amp; Reporting Subordinate: 0
                  </div>
                )}
              </div>
            </div>

            {/* Members List - Top-Bottom Order Format (Available at top, NA at bottom) */}
            <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-0.5">
              {sortedTeamMembers.length === 0 ? (
                <div className="p-6 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200 text-slate-400 space-y-2">
                  <div className="w-10 h-10 rounded-2xl bg-purple-50 text-purple-600 flex items-center justify-center mx-auto border border-purple-100 shadow-2xs">
                    <Shield className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-700">
                      {isHR
                        ? 'Successors & Reporting Subordinate: 0'
                        : 'Right now, No subordinate team members, In future your team members will be displayed here.'}
                    </p>
                    {/* <p className="text-[11px] text-slate-500 mt-1 max-w-sm mx-auto">
                      {isHR
                        ? 'Hierarchy Flow: super_admin → hr. HR successor count does not align with all tasks, but aligns strictly with (super_admin → hr) or (super_admin → hr → hr_intern). No HR subordinate is currently assigned.'
                        : 'Successor Account Status: NA • Employee Count: 0'}
                    </p> */}
                  </div>
                  {/* <div className="pt-2 flex items-center justify-center space-x-2 text-[10px] text-slate-400 font-mono">
                    <span>Predecessor: Super Admin</span>
                    <span>•</span>
                    <span>Successors &amp; Reporting Subordinate: 0</span>
                  </div> */}
                </div>
              ) : (
                  sortedTeamMembers.map((member, index) => (
                    <div
                      key={member.id}
                      className={`p-3 rounded-xl border transition-all space-y-2.5 ${
                        member.is_available
                          ? 'bg-gradient-to-r from-emerald-50/50 via-white to-white border-emerald-300 ring-1 ring-emerald-400/20 shadow-2xs hover:shadow-xs'
                          : 'bg-slate-50/70 hover:bg-white border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      {/* Top Row: Serial #, Avatar with Live Pulse, Name, Email, and Availability Badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center space-x-2.5 min-w-0">
                          <span className="text-[11px] font-bold font-mono text-slate-400 w-5 shrink-0 text-center">
                            #{index + 1}
                          </span>
                          <div className="relative shrink-0">
                            {member.photo ? (
                              <img
                                src={member.photo}
                                alt={member.full_name}
                                className="w-8 h-8 rounded-xl object-cover ring-2 ring-white shadow-xs"
                              />
                            ) : (
                              <div className={`w-8 h-8 rounded-xl font-bold flex items-center justify-center text-xs shadow-xs ${
                                member.is_available ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-700'
                              }`}>
                                {member.full_name?.charAt(0) || 'U'}
                              </div>
                            )}
                            <span
                              className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-white ${
                                member.is_available ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'
                              }`}
                              title={member.is_available ? 'Available (Online)' : 'NA (Offline)'}
                            />
                          </div>
                          <div className="min-w-0">
                            <h4 className="text-xs font-bold text-slate-900 truncate">
                              {member.full_name}
                            </h4>
                            <p className="text-[10px] text-slate-400 truncate">
                              {member.email}
                            </p>
                          </div>
                        </div>

                        {/* Availability Status Badge */}
                        <div className="shrink-0">
                          {member.is_available ? (
                            <span className="inline-flex items-center space-x-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-600 animate-pulse" />
                              <span>Available</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-500 border border-slate-200">
                              <span>NA</span>
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Info & Action Row */}
                      <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-100 gap-2">
                        <div className="flex items-center space-x-2 truncate">
                          <span className="font-semibold text-slate-700 truncate">
                            {member.designation_name || member.role}
                          </span>
                          <span className="text-slate-400 shrink-0 font-mono text-[10px]">
                            {member.designation_number || 'NA'}
                          </span>
                          {member.active_tasks_count ? (
                            <span className="text-[10px] text-slate-400">
                              • {member.active_tasks_count} tasks
                            </span>
                          ) : null}
                        </div>

                        <button
                          type="button"
                          onClick={() => onNavigate && onNavigate('tasks')}
                          className="px-2 py-0.5 rounded-lg bg-brand-50 hover:bg-brand-100 text-brand-700 font-semibold text-[10px] transition-colors flex items-center space-x-1 shrink-0 cursor-pointer"
                        >
                          <span>Allocate Task</span>
                          <span>→</span>
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {/* Hierarchy Quick Link Card */}
          {/* <div className="bg-gradient-to-br from-brand-50 to-slate-50 rounded-2xl border border-brand-200 p-5">
            <div className="flex items-center space-x-2 text-brand-900 font-bold text-sm mb-1">
              <Award className="w-4 h-4 text-brand-600" />
              <span>Superiors & Predecessors</span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed mb-3">
              Reporting to <strong>Sarah Jenkins</strong> (Technical Lead) & <strong>Alex Morgan</strong> (Director).
            </p>
            <button
              onClick={() => onNavigate && onNavigate('team')}
              className="text-xs text-brand-700 hover:text-brand-800 font-bold hover:underline flex items-center space-x-1"
            >
              <span>View Team Hierarchy →</span>
            </button>
          </div> */}
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;

