import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { attendanceApi } from '../api/client';
import { 
  CalendarCheck, Clock, Users, Calendar, ArrowLeft, ArrowRight,
  ChevronLeft, ChevronRight, CheckCircle2, AlertCircle, RefreshCw,
  Utensils, Coffee, LogIn, LogOut, Shield, Award, Check, Sparkles, Filter
} from 'lucide-react';

export const AttendancePage = () => {
  const { user } = useAuth();
  const userRoleNorm = (user?.role || '').toLowerCase().replace(' ', '_');
  const isSuperAdmin = userRoleNorm === 'super_admin' || userRoleNorm === 'superadmin';
  const isAdmin = userRoleNorm === 'admin';
  const isSuperAdminOrAdmin = isSuperAdmin || isAdmin;

  // Active view: 'my' (My Attendance) or 'team' (Team Attendance, Admin/Superadmin only)
  const [activeTab, setActiveTab] = useState('my');

  // ---------------- My Attendance State ----------------
  const [myAttendance, setMyAttendance] = useState({
    items: [],
    total: 0,
    page: 1,
    page_size: 10,
    total_pages: 1,
  });
  const [myLoading, setMyLoading] = useState(false);
  const [myCurrentPage, setMyCurrentPage] = useState(1);

  // ---------------- Team Attendance State ----------------
  const [teamDateStr, setTeamDateStr] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });
  const [teamAttendanceData, setTeamAttendanceData] = useState(null);
  const [teamLoading, setTeamLoading] = useState(false);
  const [isSaturdayWorking, setIsSaturdayWorking] = useState(false);
  const [togglingSaturday, setTogglingSaturday] = useState(false);
  const [toggleSuccessMsg, setToggleSuccessMsg] = useState('');

  // ---------------- Today Attendance & Dynamic Punch State ----------------
  const [todayData, setTodayData] = useState(null);
  const [marking, setMarking] = useState(false);
  const [punchMessage, setPunchMessage] = useState('');

  // Load Today's Attendance
  const fetchToday = async () => {
    try {
      const res = await attendanceApi.getToday();
      setTodayData(res.data);
      if (res.data.is_saturday_working !== undefined) {
        setIsSaturdayWorking(res.data.is_saturday_working);
      }
    } catch (err) {
      console.error('Failed to load today attendance in AttendancePage:', err);
    }
  };

  // Load My Attendance (Paginated, Reverse Chronological)
  const fetchMyAttendance = async (page = myCurrentPage) => {
    try {
      setMyLoading(true);
      const res = await attendanceApi.getMyAttendance(page, 10);
      setMyAttendance(res.data);
    } catch (err) {
      console.error('Failed to load my attendance:', err);
    } finally {
      setMyLoading(false);
    }
  };

  // Load Team Attendance (For selected date, Ascending order by names)
  const fetchTeamAttendance = async (dateStr = teamDateStr) => {
    if (!isSuperAdminOrAdmin) return;
    try {
      setTeamLoading(true);
      const res = await attendanceApi.getTeamAttendance(dateStr);
      setTeamAttendanceData(res.data);
      if (res.data.is_saturday_working !== undefined) {
        setIsSaturdayWorking(res.data.is_saturday_working);
      }
    } catch (err) {
      console.error('Failed to load team attendance:', err);
    } finally {
      setTeamLoading(false);
    }
  };

  useEffect(() => {
    fetchToday();
    fetchMyAttendance(myCurrentPage);
  }, [user?.id, myCurrentPage]);

  useEffect(() => {
    if (isSuperAdminOrAdmin && activeTab === 'team') {
      fetchTeamAttendance(teamDateStr);
    }
  }, [teamDateStr, isSuperAdminOrAdmin, activeTab]);

  // Handle Dynamic Punch Action (check_in, lunch, break, check_out)
  const handleMarkAttendance = async (action) => {
    try {
      setMarking(true);
      setPunchMessage('');
      const res = await attendanceApi.markAttendance(action);
      setPunchMessage(res.data.message || 'Marked successfully!');
      await fetchToday();
      await fetchMyAttendance(1);
      setTimeout(() => setPunchMessage(''), 4000);
    } catch (err) {
      console.error('Failed to mark attendance:', err);
      const msg = err.response?.data?.detail || 'Failed to mark attendance.';
      setPunchMessage(msg);
      setTimeout(() => setPunchMessage(''), 4000);
    } finally {
      setMarking(false);
    }
  };

  // Handle Saturday Working Day Toggle (Exclusively Superadmin & Admin)
  const handleToggleSaturday = async (checked) => {
    try {
      setTogglingSaturday(true);
      setIsSaturdayWorking(checked);
      const res = await attendanceApi.toggleSaturday(checked);
      setToggleSuccessMsg(res.data.message || 'Saturday status updated!');
      await fetchToday();
      if (activeTab === 'team') {
        await fetchTeamAttendance(teamDateStr);
      }
      setTimeout(() => setToggleSuccessMsg(''), 4000);
    } catch (err) {
      console.error('Failed to toggle Saturday:', err);
    } finally {
      setTogglingSaturday(false);
    }
  };

  // Date Navigation Helpers for Team Attendance (Previous day, Next day, nth previous day)
  const changeDateByDays = (daysDelta) => {
    const current = new Date(teamDateStr);
    current.setDate(current.getDate() + daysDelta);
    const newStr = current.toISOString().split('T')[0];
    setTeamDateStr(newStr);
  };

  const setRelativeDay = (daysAgo) => {
    const d = new Date();
    d.setDate(d.getDate() - daysAgo);
    setTeamDateStr(d.toISOString().split('T')[0]);
  };

  // Status Badge Helper
  const getStatusBadge = (status) => {
    switch ((status || '').toLowerCase()) {
      case 'present':
        return 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'on duty':
        return 'bg-blue-50 text-blue-700 border-blue-200';
      case 'saturday working':
        return 'bg-purple-50 text-purple-700 border-purple-200';
      case 'half day':
        return 'bg-amber-50 text-amber-700 border-amber-200';
      case 'weekend':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      default:
        return 'bg-slate-50 text-slate-500 border-slate-200';
    }
  };

  const getRoleBadge = (role) => {
    const r = (role || '').toLowerCase();
    if (r.includes('super_admin') || r.includes('superadmin')) return 'bg-purple-100 text-purple-800 border-purple-200';
    if (r.includes('admin')) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (r.includes('team_lead')) return 'bg-amber-100 text-amber-800 border-amber-200';
    if (r === 'employee') return 'bg-sky-100 text-sky-800 border-sky-200';
    if (r.includes('hr')) return 'bg-emerald-100 text-emerald-800 border-emerald-200';
    return 'bg-brand-100 text-brand-800 border-brand-200';
  };

  // Calculate Next Dynamic Action for Today
  const nextActionInfo = useMemo(() => {
    if (!todayData || !todayData.record) {
      return { action: 'check_in', label: 'Check-in', icon: LogIn, color: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    const rec = todayData.record;
    if (!rec.check_in_raw) {
      return { action: 'check_in', label: 'Check-in', icon: LogIn, color: 'bg-emerald-600 hover:bg-emerald-700 text-white' };
    }
    if (rec.lunch_start === '--') {
      return { action: 'lunch', label: 'Start Lunch', icon: Utensils, color: 'bg-amber-600 hover:bg-amber-700 text-white' };
    }
    if (rec.lunch_end === '--') {
      return { action: 'lunch', label: 'End Lunch', icon: CheckCircle2, color: 'bg-amber-700 hover:bg-amber-800 text-white' };
    }
    if (rec.break_start === '--') {
      return { action: 'break', label: 'Start Break', icon: Coffee, color: 'bg-purple-600 hover:bg-purple-700 text-white' };
    }
    if (rec.break_end === '--') {
      return { action: 'break', label: 'End Break', icon: CheckCircle2, color: 'bg-purple-700 hover:bg-purple-800 text-white' };
    }
    if (!rec.check_out_raw) {
      return { action: 'check_out', label: 'Check-out', icon: LogOut, color: 'bg-rose-600 hover:bg-rose-700 text-white' };
    }
    return { action: 'completed', label: 'Day Completed', icon: CheckCircle2, color: 'bg-slate-200 text-slate-700 cursor-not-allowed' };
  }, [todayData]);

  const ActionIcon = nextActionInfo.icon;

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner Header */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <CalendarCheck className="w-6 h-6 text-brand-600" />
              <h1 className="text-2xl font-bold text-slate-900">Attendance Management</h1>
              <span className="text-xs bg-brand-100 text-brand-800 font-semibold px-2.5 py-0.5 rounded-full">
                Ledger View
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Track everyday attendance sessions, check-in intervals, lunch breaks, and team records.
            </p>
          </div>

          {/* Tab Navigation Pill Buttons */}
          <div className="flex items-center space-x-2 bg-slate-100 p-1 rounded-xl border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveTab('my')}
              className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                activeTab === 'my'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>1. My Attendance</span>
            </button>

            {isSuperAdminOrAdmin && (
              <button
                type="button"
                onClick={() => setActiveTab('team')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center space-x-1.5 ${
                  activeTab === 'team'
                    ? 'bg-brand-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>2. Team Attendance (Admin)</span>
              </button>
            )}
          </div>
        </div>

        {/* Live Attendance Punch Strip (Except Superadmin) */}
        {!isSuperAdmin && (
          <div className="mt-6 pt-5 border-t border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/70 p-4 rounded-xl border border-slate-200/80">
            {/* 1st Part: Top: "Attendance", Bottom: "Everyday • Today date" */}
            <div className="min-w-0">
              <span className="text-xs font-bold uppercase tracking-wider text-brand-700 block">
                Attendance
              </span>
              <div className="flex items-baseline space-x-2 mt-0.5">
                <span className="text-sm font-extrabold text-slate-800">
                  {todayData?.today_formatted || 'Loading date...'}
                </span>
                <span className="text-xs font-semibold text-slate-500">
                  (Everyday • {todayData?.current_time_formatted || 'Live'})
                </span>
              </div>
              <p className="text-[11px] text-slate-500 mt-1">
                Session Window: <span className="font-semibold text-slate-700">{todayData?.active_session?.session_window || '9:30 AM - 8:30 PM'}</span>
                {todayData?.active_session?.next_session && (
                  <span className="ml-2 text-brand-600 font-medium">({todayData.active_session.next_session})</span>
                )}
              </p>
            </div>

            {/* 2nd Part: Dynamic Action Punch Button */}
            <div className="flex items-center space-x-3 shrink-0">
              {punchMessage && (
                <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 animate-in fade-in">
                  ✓ {punchMessage}
                </span>
              )}
              <button
                type="button"
                onClick={() => handleMarkAttendance(nextActionInfo.action)}
                disabled={marking || nextActionInfo.action === 'completed'}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center space-x-2 shadow-xs cursor-pointer ${nextActionInfo.color}`}
              >
                {marking ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <ActionIcon className="w-4 h-4" />
                )}
                <span>Mark {nextActionInfo.label}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ================================= TAB 1: MY ATTENDANCE ================================= */}
      {activeTab === 'my' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                <span>My Everyday Attendance Records</span>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200">
                  Reverse Chronological Order (Today &rarr; Nth Previous Day)
                </span>
              </h2>
              <p className="text-xs text-slate-500">
                Detailed day-to-day session ledger with check-in, lunch breaks, and total working hours.
              </p>
            </div>

            <button
              type="button"
              onClick={() => fetchMyAttendance(myCurrentPage)}
              className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer flex items-center space-x-1.5 self-start"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${myLoading ? 'animate-spin' : ''}`} />
              <span>Refresh Records</span>
            </button>
          </div>

          {/* Table Container */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th scope="col" className="py-3.5 px-4">1. Date & Day</th>
                    <th scope="col" className="py-3.5 px-4 text-center">2. Check-in (9:30-11:30 AM)</th>
                    <th scope="col" className="py-3.5 px-4 text-center">3. Lunch (12:00-4:30 PM)</th>
                    <th scope="col" className="py-3.5 px-4 text-center">4. Break (5:00-6:15 PM)</th>
                    <th scope="col" className="py-3.5 px-4 text-center">5. Check-out (6:30-8:30 PM)</th>
                    <th scope="col" className="py-3.5 px-4 text-center">6. Working Hours</th>
                    <th scope="col" className="py-3.5 px-4 text-right">7. Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {myLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
                          <span>Loading attendance records...</span>
                        </div>
                      </td>
                    </tr>
                  ) : myAttendance.items.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No attendance records found.
                      </td>
                    </tr>
                  ) : (
                    myAttendance.items.map((row) => (
                      <tr key={row.id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Date & Day */}
                        <td className="py-3.5 px-4 font-semibold text-slate-900">
                          <div className="flex items-center space-x-2">
                            <span className="font-mono text-slate-800">{row.formatted_date}</span>
                            <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-500 font-medium">
                              {row.day_name}
                            </span>
                          </div>
                        </td>

                        {/* Check-in */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                          {row.check_in !== '--' ? (
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {row.check_in}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Lunch */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                          {row.lunch_session !== '--' ? (
                            <span className="text-amber-800 font-medium bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                              {row.lunch_session}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Break */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                          {row.break_session !== '--' ? (
                            <span className="text-purple-800 font-medium bg-purple-50 px-2 py-0.5 rounded border border-purple-200">
                              {row.break_session}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Check-out */}
                        <td className="py-3.5 px-4 text-center font-mono text-slate-700">
                          {row.check_out !== '--' ? (
                            <span className="text-rose-700 font-bold bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              {row.check_out}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Total Hours */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-mono font-bold text-slate-900 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                            {row.total_hours > 0 ? `${row.total_hours} hrs` : '--'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadge(row.status)}`}>
                            {row.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50/60 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-600">
              <div>
                Showing Page <strong className="font-bold text-slate-900">{myAttendance.page}</strong> of{' '}
                <strong className="font-bold text-slate-900">{myAttendance.total_pages}</strong> ({myAttendance.total} total days recorded)
              </div>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => setMyCurrentPage(p => Math.max(1, p - 1))}
                  disabled={myCurrentPage <= 1}
                  className="px-3 py-1.5 bg-white text-slate-700 font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  onClick={() => setMyCurrentPage(p => Math.min(myAttendance.total_pages, p + 1))}
                  disabled={myCurrentPage >= myAttendance.total_pages}
                  className="px-3 py-1.5 bg-white text-slate-700 font-semibold rounded-lg border border-slate-200 hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-1 cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================================= TAB 2: TEAM ATTENDANCE (SUPERADMIN & ADMIN ONLY) ================================= */}
      {activeTab === 'team' && isSuperAdminOrAdmin && (
        <div className="space-y-4 animate-in fade-in duration-150">
          {/* Controls Bar Above The List: Date button format selector + Saturday Working tick button */}
          <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center space-x-2">
                  <span>Team Attendance by Date</span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                    A &rarr; Z Ascending Order of Names
                  </span>
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  View and verify all employees' attendance records for any selected day.
                </p>
              </div>

              {/* Saturday Optional Office Toggle (Exclusively for Admin and Superadmin) */}
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between sm:justify-start space-x-3">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={isSaturdayWorking}
                    disabled={togglingSaturday}
                    onChange={(e) => handleToggleSaturday(e.target.checked)}
                    className="w-4 h-4 text-brand-600 rounded border-slate-300 focus:ring-brand-500 cursor-pointer"
                  />
                  <span className="text-xs font-bold text-slate-800">
                    Saturday Working (Tick Optional)
                  </span>
                </label>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                  isSaturdayWorking ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-200 text-slate-600 border-slate-300'
                }`}>
                  {isSaturdayWorking ? 'Office Open' : 'Office Off'}
                </span>
                {toggleSuccessMsg && (
                  <span className="text-[11px] text-emerald-600 font-semibold ml-2">
                    ✓ {toggleSuccessMsg}
                  </span>
                )}
              </div>
            </div>

            {/* Date Format Buttons: Quick date buttons & Nth previous day selector */}
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3">
              {/* Quick Preset Buttons (in Date Format) */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-slate-600 mr-1 flex items-center space-x-1">
                  <Calendar className="w-3.5 h-3.5 text-brand-600" />
                  <span>Select Date:</span>
                </span>
                <button
                  type="button"
                  onClick={() => setRelativeDay(0)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer border ${
                    teamDateStr === new Date().toISOString().split('T')[0]
                      ? 'bg-brand-600 text-white border-brand-600 shadow-2xs'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Today ({new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })})
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDay(1)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  Yesterday (1 Day Ago)
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDay(2)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  2 Days Ago
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDay(3)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  3 Days Ago
                </button>
                <button
                  type="button"
                  onClick={() => setRelativeDay(7)}
                  className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-50 text-slate-700 border border-slate-200 hover:bg-slate-100 transition-all cursor-pointer"
                >
                  1 Week Ago
                </button>
              </div>

              {/* Day-by-Day Stepper & Exact Date Picker in Date Format */}
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={() => changeDateByDays(-1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                  title="Previous Day"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>

                {/* Date Input / Button in Date Format */}
                <input
                  type="date"
                  value={teamDateStr}
                  onChange={(e) => setTeamDateStr(e.target.value)}
                  className="px-3 py-1.5 text-xs font-bold text-slate-800 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-brand-500 cursor-pointer"
                />

                <button
                  type="button"
                  onClick={() => changeDateByDays(1)}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors cursor-pointer"
                  title="Next Day"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>

          {/* Date Summary Metric Strip */}
          {teamAttendanceData?.summary && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 bg-white rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-400 block text-[10px] uppercase font-bold">Total Headcount</span>
                <span className="text-xl font-extrabold text-slate-900 mt-0.5 block">
                  {teamAttendanceData.summary.total_employees}
                </span>
              </div>
              <div className="p-3.5 bg-emerald-50/60 rounded-xl border border-emerald-200 text-xs">
                <span className="text-emerald-700 block text-[10px] uppercase font-bold">Present On Date</span>
                <span className="text-xl font-extrabold text-emerald-800 mt-0.5 block">
                  {teamAttendanceData.summary.present_count}
                </span>
              </div>
              <div className="p-3.5 bg-blue-50/60 rounded-xl border border-blue-200 text-xs">
                <span className="text-blue-700 block text-[10px] uppercase font-bold">On Duty Status</span>
                <span className="text-xl font-extrabold text-blue-800 mt-0.5 block">
                  {teamAttendanceData.summary.on_duty_count}
                </span>
              </div>
              <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                <span className="text-slate-500 block text-[10px] uppercase font-bold">Selected Ledger Date</span>
                <span className="text-sm font-bold text-slate-800 mt-1 block truncate">
                  {teamAttendanceData.selected_date_formatted}
                </span>
              </div>
            </div>
          )}

          {/* All Employees in List Format in Ascending Order of Names (A -> Z) */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
              <div className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-brand-600" />
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800">
                  All Employees Attendance List (Sorted A &rarr; Z)
                </h4>
              </div>
              <span className="text-xs font-semibold text-slate-500">
                {teamAttendanceData?.employees?.length || 0} Employees
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                    <th scope="col" className="py-3.5 px-4">Employee (Ascending A &rarr; Z)</th>
                    <th scope="col" className="py-3.5 px-4 text-center">Check-in</th>
                    <th scope="col" className="py-3.5 px-4 text-center">Lunch Period</th>
                    <th scope="col" className="py-3.5 px-4 text-center">Break Period</th>
                    <th scope="col" className="py-3.5 px-4 text-center">Check-out</th>
                    <th scope="col" className="py-3.5 px-4 text-center">Total Working Hours</th>
                    <th scope="col" className="py-3.5 px-4 text-right">Attendance Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {teamLoading ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        <div className="flex items-center justify-center space-x-2">
                          <RefreshCw className="w-4 h-4 animate-spin text-brand-600" />
                          <span>Loading team attendance for {teamDateStr}...</span>
                        </div>
                      </td>
                    </tr>
                  ) : (!teamAttendanceData?.employees || teamAttendanceData.employees.length === 0) ? (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400">
                        No team attendance records found for this date.
                      </td>
                    </tr>
                  ) : (
                    teamAttendanceData.employees.map((emp) => (
                      <tr key={emp.employee_id} className="hover:bg-slate-50/80 transition-colors">
                        {/* Employee Details (A -> Z) */}
                        <td className="py-3.5 px-4">
                          <div className="flex items-center space-x-3">
                            {emp.avatar ? (
                              <img
                                src={emp.avatar}
                                alt={emp.employee_name}
                                className="w-9 h-9 rounded-xl object-cover ring-1 ring-slate-200 shadow-2xs shrink-0"
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-xl bg-brand-100 text-brand-800 font-bold flex items-center justify-center text-xs shrink-0 shadow-2xs">
                                {emp.employee_name?.charAt(0) || 'U'}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="flex items-center space-x-2">
                                <span className="font-bold text-slate-900 truncate">
                                  {emp.employee_name}
                                </span>
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${getRoleBadge(emp.role)}`}>
                                  {emp.role?.replace('_', ' ').toUpperCase()}
                                </span>
                              </div>
                              <span className="text-[11px] text-slate-500 truncate block mt-0.5">
                                {emp.designation} • {emp.employee_email}
                              </span>
                            </div>
                          </div>
                        </td>

                        {/* Check-in */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {emp.check_in !== '--' ? (
                            <span className="text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                              {emp.check_in}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Lunch */}
                        <td className="py-3.5 px-4 text-center font-mono">
                          {emp.lunch !== '--' ? (
                            <span className="text-amber-800 bg-amber-50 px-2 py-0.5 rounded border border-amber-200 text-[11px]">
                              {emp.lunch}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Break */}
                        <td className="py-3.5 px-4 text-center font-mono">
                          {emp.break !== '--' ? (
                            <span className="text-purple-800 bg-purple-50 px-2 py-0.5 rounded border border-purple-200 text-[11px]">
                              {emp.break}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Check-out */}
                        <td className="py-3.5 px-4 text-center font-mono font-semibold">
                          {emp.check_out !== '--' ? (
                            <span className="text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                              {emp.check_out}
                            </span>
                          ) : (
                            <span className="text-slate-400">--</span>
                          )}
                        </td>

                        {/* Total Hours */}
                        <td className="py-3.5 px-4 text-center">
                          <span className="font-mono font-bold text-slate-800 bg-slate-50 px-2.5 py-1 rounded-md border border-slate-200">
                            {emp.total_hours > 0 ? `${emp.total_hours} hrs` : '--'}
                          </span>
                        </td>

                        {/* Status */}
                        <td className="py-3.5 px-4 text-right">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-bold border ${getStatusBadge(emp.status)}`}>
                            {emp.status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AttendancePage;
