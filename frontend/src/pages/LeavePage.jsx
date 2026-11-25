import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { leaveApi } from '../api/client';
import {
  CalendarOff,
  Calendar,
  Clock,
  AlertTriangle,
  HeartPulse,
  Shield,
  CheckCircle2,
  XCircle,
  Send,
  Sliders,
  Plus,
  X,
  Loader2,
  Users,
  Inbox,
  FileText,
} from 'lucide-react';

const DURATION_MODES = [
  { value: 'single_day', label: 'Single Day', desc: '1 full day' },
  { value: 'half_day', label: 'Half Day', desc: '0.5 day (AM/PM)' },
  { value: 'consecutive_days', label: 'Consecutive Days', desc: 'Start to end range' },
  { value: 'selective_days', label: 'Selective Days', desc: 'Pick multiple dates' },
];

const LEAVE_CATEGORIES = [
  { value: 'regular', label: 'Regular Leave', icon: Calendar },
  { value: 'emergency_leave', label: 'Emergency Leave', icon: AlertTriangle },
  { value: 'sick_leave', label: 'Sick Leave', icon: HeartPulse },
];

const TIER_LABELS = {
  super_admin: '1. Super Admin',
  admin: '2. Admin',
  higher_officer: '3. Higher Officer',
};

export const LeavePage = () => {
  const { user } = useAuth();
  const roleNorm = (user?.role || '').toLowerCase().replace(' ', '_');
  const isSuperAdmin = roleNorm === 'super_admin' || roleNorm === 'superadmin';
  const canReviewIncoming = ['super_admin', 'superadmin', 'admin', 'team_lead', 'hr', 'human_resource_manager'].includes(roleNorm);

  const [loading, setLoading] = useState(true);
  const [policies, setPolicies] = useState([]);
  const [routingRecipients, setRoutingRecipients] = useState([]);
  const [myLeaves, setMyLeaves] = useState([]);
  const [incomingLeaves, setIncomingLeaves] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState(isSuperAdmin ? 'incoming' : 'apply');

  // Super Admin limit editor state
  const [limitEdits, setLimitEdits] = useState({});
  const [savingLimits, setSavingLimits] = useState(false);
  const [limitMsg, setLimitMsg] = useState('');
  const [limitErr, setLimitErr] = useState('');

  // Leave application form state
  const [leaveCategory, setLeaveCategory] = useState('regular');
  const [durationMode, setDurationMode] = useState('single_day');
  const [halfDaySlot, setHalfDaySlot] = useState('morning');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectiveInput, setSelectiveInput] = useState('');
  const [selectedDates, setSelectedDates] = useState([]);
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [applyErr, setApplyErr] = useState('');
  const [applyMsg, setApplyMsg] = useState('');

  // Decision remarks map
  const [remarksMap, setRemarksMap] = useState({});
  const [decidingId, setDecidingId] = useState(null);

  const fetchAll = async () => {
    try {
      setLoading(true);
      const calls = [leaveApi.getPolicies(), leaveApi.getMyLeaves()];
      if (canReviewIncoming) {
        calls.push(leaveApi.getIncoming());
      }
      const results = await Promise.all(calls);
      const polData = results[0].data;
      setPolicies(polData.policies || []);
      setRoutingRecipients(polData.routing_recipients || []);

      const initLimits = {};
      (polData.policies || []).forEach((p) => {
        initLimits[p.leave_key] = p.max_days_limit;
      });
      setLimitEdits(initLimits);

      setMyLeaves(results[1].data.items || []);
      if (canReviewIncoming && results[2]) {
        setIncomingLeaves(results[2].data.items || []);
      }
    } catch (err) {
      console.error('Failed to fetch leave data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAll();
  }, [user?.id]);

  const computedDays = useMemo(() => {
    if (durationMode === 'single_day') return startDate ? 1 : 0;
    if (durationMode === 'half_day') return startDate ? 0.5 : 0;
    if (durationMode === 'consecutive_days') {
      if (!startDate || !endDate) return 0;
      const diff = (new Date(endDate) - new Date(startDate)) / (1000 * 60 * 60 * 24);
      return diff >= 0 ? diff + 1 : 0;
    }
    if (durationMode === 'selective_days') return selectedDates.length;
    return 0;
  }, [durationMode, startDate, endDate, selectedDates]);

  const handleAddSelectiveDate = () => {
    if (!selectiveInput) return;
    if (!selectedDates.includes(selectiveInput)) {
      setSelectedDates((prev) => [...prev, selectiveInput].sort());
    }
    setSelectiveInput('');
  };

  const handleRemoveSelectiveDate = (d) => {
    setSelectedDates((prev) => prev.filter((item) => item !== d));
  };

  const handleSaveLimits = async (e) => {
    e.preventDefault();
    setLimitErr('');
    setLimitMsg('');
    setSavingLimits(true);
    try {
      const payload = Object.entries(limitEdits).map(([leave_key, max_days_limit]) => ({
        leave_key,
        max_days_limit: Number(max_days_limit) || 0,
      }));
      await leaveApi.updatePolicies(payload);
      setLimitMsg('Leave count limits updated successfully for all designations.');
      await fetchAll();
    } catch (err) {
      setLimitErr(err.response?.data?.detail || 'Failed to update leave limits.');
    } finally {
      setSavingLimits(false);
    }
  };

  const handleApplyLeave = async (e) => {
    e.preventDefault();
    setApplyErr('');
    setApplyMsg('');

    if (!reason.trim() || reason.trim().length < 3) {
      setApplyErr('Please enter a valid reason (at least 3 characters).');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        leave_category: leaveCategory,
        duration_mode: durationMode,
        half_day_slot: durationMode === 'half_day' ? halfDaySlot : null,
        start_date: durationMode === 'selective_days' ? null : startDate || null,
        end_date: durationMode === 'consecutive_days' ? endDate || null : null,
        selected_dates: durationMode === 'selective_days' ? selectedDates : null,
        reason: reason.trim(),
      };
      const res = await leaveApi.apply(payload);
      setApplyMsg(res.data?.message || 'Leave application submitted.');
      setStartDate('');
      setEndDate('');
      setSelectedDates([]);
      setReason('');
      await fetchAll();
    } catch (err) {
      setApplyErr(err.response?.data?.detail || 'Failed to submit leave request.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecision = async (leaveId, decision) => {
    setDecidingId(leaveId);
    try {
      await leaveApi.decide(leaveId, decision, remarksMap[leaveId] || '');
      await fetchAll();
    } catch (err) {
      console.error('Failed to update leave decision:', err);
    } finally {
      setDecidingId(null);
    }
  };

  const getStatusBadge = (status) => {
    if (status === 'Approved') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
    if (status === 'Rejected') return 'bg-red-50 text-red-700 border-red-200';
    return 'bg-amber-50 text-amber-700 border-amber-200';
  };

  const formatDateSummary = (item) => {
    if (item.duration_mode === 'selective_days' && Array.isArray(item.selected_dates) && item.selected_dates.length > 0) {
      return item.selected_dates.join(', ');
    }
    if (item.duration_mode === 'half_day') {
      return `${item.start_date} (${item.half_day_slot || 'morning'})`;
    }
    if (item.start_date && item.end_date && item.start_date !== item.end_date) {
      return `${item.start_date} → ${item.end_date}`;
    }
    return item.start_date || '—';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-7 h-7 animate-spin text-brand-600" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center space-x-2.5">
            <CalendarOff className="w-6 h-6 text-brand-600" />
            <span>Leave Management</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            {isSuperAdmin
              ? 'Customize organization-wide leave count limits and review routed leave requests.'
              : 'Apply for leave and track approvals from your 3 designated officers (Super Admin, Admin, Higher Officer).'}
          </p>
        </div>

        {/* Sub-navigation pills */}
        <div className="flex flex-wrap items-center gap-2 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs">
          {!isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveSubTab('apply')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                activeSubTab === 'apply' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              Apply & My Leaves
            </button>
          )}
          {canReviewIncoming && (
            <button
              type="button"
              onClick={() => setActiveSubTab('incoming')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                activeSubTab === 'incoming' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Inbox className="w-3.5 h-3.5" />
              <span>Incoming Requests ({incomingLeaves.filter((l) => l.status === 'Pending').length})</span>
            </button>
          )}
          {isSuperAdmin && (
            <button
              type="button"
              onClick={() => setActiveSubTab('limits')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center space-x-1.5 cursor-pointer ${
                activeSubTab === 'limits' ? 'bg-brand-600 text-white shadow-xs' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Customize Leave Limits</span>
            </button>
          )}
        </div>
      </div>

      {/* Quota / Policy Cards (Always visible) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {policies.map((pol) => (
          <div key={pol.leave_key} className="bg-white rounded-2xl p-4 border border-slate-200 shadow-2xs">
            <p className="text-[11px] font-bold text-slate-700 truncate" title={pol.label}>
              {pol.label}
            </p>
            <div className="mt-2 flex items-baseline justify-between">
              <span className="text-xl font-extrabold text-brand-700">
                {isSuperAdmin ? pol.max_days_limit : pol.remaining_days}
              </span>
              <span className="text-[10px] font-semibold text-slate-400">
                {isSuperAdmin ? 'Max Days' : `/ ${pol.max_days_limit} days`}
              </span>
            </div>
            {!isSuperAdmin && (
              <p className="text-[10px] text-slate-400 mt-1">Used: {pol.used_days} day(s)</p>
            )}
          </div>
        ))}
      </div>

      {/* ================= SUPER ADMIN: CUSTOMIZE LEAVE LIMITS ================= */}
      {isSuperAdmin && activeSubTab === 'limits' && (
        <form onSubmit={handleSaveLimits} className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-5">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center space-x-2.5">
              <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-700 flex items-center justify-center">
                <Shield className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-900">Super Admin Leave Limit Configuration</h2>
                <p className="text-xs text-slate-500">Only Super Admin can customize maximum leave counts across all 6 cases.</p>
              </div>
            </div>
          </div>

          {limitErr && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{limitErr}</div>
          )}
          {limitMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">{limitMsg}</div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.map((pol) => (
              <div key={pol.leave_key} className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-2">
                <label className="block text-xs font-bold text-slate-800">{pol.label}</label>
                <p className="text-[11px] text-slate-500">{pol.description}</p>
                <div className="flex items-center space-x-2 pt-1">
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    max="365"
                    value={limitEdits[pol.leave_key] ?? pol.max_days_limit}
                    onChange={(e) =>
                      setLimitEdits((prev) => ({ ...prev, [pol.leave_key]: e.target.value }))
                    }
                    className="w-28 px-3 py-1.5 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-900"
                  />
                  <span className="text-xs text-slate-500">days max</span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={savingLimits}
              className="px-5 py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {savingLimits && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Save Leave Limits</span>
            </button>
          </div>
        </form>
      )}

      {/* ================= NON-SUPER-ADMIN: APPLY LEAVE + MY HISTORY ================= */}
      {!isSuperAdmin && activeSubTab === 'apply' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Apply Form */}
          <form onSubmit={handleApplyLeave} className="lg:col-span-5 bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <Send className="w-4 h-4 text-brand-600" />
              <span>Apply for Leave</span>
            </h2>

            {applyErr && (
              <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs text-red-700">{applyErr}</div>
            )}
            {applyMsg && (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-700">{applyMsg}</div>
            )}

            {/* Leave Category */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Leave Category</label>
              <div className="grid grid-cols-3 gap-2">
                {LEAVE_CATEGORIES.map((cat) => {
                  const Icon = cat.icon;
                  const active = leaveCategory === cat.value;
                  return (
                    <button
                      key={cat.value}
                      type="button"
                      onClick={() => setLeaveCategory(cat.value)}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        active
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 mb-1" />
                      <div className="text-[11px] font-bold leading-tight">{cat.label}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Duration Mode */}
            <div>
              <label className="block text-[11px] font-bold uppercase text-slate-500 mb-1.5">Duration Case</label>
              <div className="grid grid-cols-2 gap-2">
                {DURATION_MODES.map((m) => (
                  <button
                    key={m.value}
                    type="button"
                    onClick={() => setDurationMode(m.value)}
                    className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                      durationMode === m.value
                        ? 'border-brand-500 bg-brand-50 text-brand-800'
                        : 'border-slate-200 bg-slate-50/70 text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <div className="text-xs font-bold">{m.label}</div>
                    <div className="text-[10px] opacity-75">{m.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Date Pickers based on duration mode */}
            {durationMode === 'single_day' && (
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">Leave Date</label>
                <input
                  type="date"
                  required
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                />
              </div>
            )}

            {durationMode === 'half_day' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Session</label>
                  <select
                    value={halfDaySlot}
                    onChange={(e) => setHalfDaySlot(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  >
                    <option value="morning">Morning (1st Half)</option>
                    <option value="afternoon">Afternoon (2nd Half)</option>
                  </select>
                </div>
              </div>
            )}

            {durationMode === 'consecutive_days' && (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">Start Date</label>
                  <input
                    type="date"
                    required
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">End Date</label>
                  <input
                    type="date"
                    required
                    min={startDate || undefined}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>
              </div>
            )}

            {durationMode === 'selective_days' && (
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-600">Select Individual Dates</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="date"
                    value={selectiveInput}
                    onChange={(e) => setSelectiveInput(e.target.value)}
                    className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
                  />
                  <button
                    type="button"
                    onClick={handleAddSelectiveDate}
                    className="px-3 py-2 rounded-xl bg-slate-800 text-white text-xs font-semibold hover:bg-slate-900 flex items-center space-x-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Add</span>
                  </button>
                </div>
                {selectedDates.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {selectedDates.map((d) => (
                      <span
                        key={d}
                        className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-full bg-brand-50 text-brand-800 border border-brand-200 text-[11px] font-semibold"
                      >
                        <span>{d}</span>
                        <button type="button" onClick={() => handleRemoveSelectiveDate(d)} className="hover:text-red-600 cursor-pointer">
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Reason */}
            <div>
              <label className="block text-[11px] font-bold text-slate-600 mb-1">Reason</label>
              <textarea
                rows={3}
                required
                placeholder="Briefly describe the reason for leave..."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs"
              />
            </div>

            {/* 3-Recipient Routing Preview */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5">
              <div className="flex items-center justify-between text-[11px] font-bold text-slate-700">
                <span className="flex items-center space-x-1">
                  <Users className="w-3.5 h-3.5 text-brand-600" />
                  <span>Routed Strictly To (3 Designations):</span>
                </span>
                <span className="text-brand-700">{computedDays} day(s)</span>
              </div>
              <div className="space-y-1">
                {routingRecipients.map((r) => (
                  <div key={`${r.tier}-${r.user_id}`} className="flex items-center justify-between text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-700">{TIER_LABELS[r.tier] || r.tier}</span>
                    <span>{r.name} ({r.role})</span>
                  </div>
                ))}
              </div>
            </div>

            <button
              type="submit"
              disabled={submitting || computedDays <= 0}
              className="w-full py-2.5 bg-brand-600 hover:bg-brand-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {submitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
              <span>Submit Leave Application</span>
            </button>
          </form>

          {/* My Leaves Table */}
          <div className="lg:col-span-7 bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
            <h2 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <FileText className="w-4 h-4 text-brand-600" />
              <span>My Leave Applications ({myLeaves.length})</span>
            </h2>

            {myLeaves.length === 0 ? (
              <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                No leave requests submitted yet.
              </div>
            ) : (
              <div className="space-y-3">
                {myLeaves.map((item) => (
                  <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/50 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center space-x-2">
                        <span className="text-xs font-bold text-slate-900 capitalize">
                          {item.duration_mode.replace('_', ' ')}
                        </span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-200/70 text-slate-700 capitalize">
                          {item.leave_category.replace('_', ' ')}
                        </span>
                        <span className="text-[11px] font-bold text-brand-700">{item.total_days} day(s)</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(item.status)}`}>
                        {item.status}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-600">
                      <strong>Dates:</strong> {formatDateSummary(item)}
                    </p>
                    <p className="text-xs text-slate-700">{item.reason}</p>

                    <div className="pt-2 border-t border-slate-200/70 flex flex-wrap gap-2">
                      {item.recipients.map((r) => (
                        <span
                          key={`${item.id}-${r.user_id}`}
                          className="text-[10px] px-2 py-0.5 rounded-md bg-white border border-slate-200 text-slate-600"
                        >
                          {TIER_LABELS[r.tier] || r.tier}: <strong>{r.name}</strong> ({r.decision})
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= INCOMING LEAVE REQUESTS (3 DESIGNATED RECIPIENTS ONLY) ================= */}
      {canReviewIncoming && activeSubTab === 'incoming' && (
        <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-slate-900">Incoming Leave Requests</h2>
              <p className="text-xs text-slate-500">
                Showing only applications routed to you as Super Admin, Branch Admin, or Direct Higher Officer.
              </p>
            </div>
          </div>

          {incomingLeaves.length === 0 ? (
            <div className="p-10 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
              No incoming leave requests assigned to your designation.
            </div>
          ) : (
            <div className="space-y-3">
              {incomingLeaves.map((item) => (
                <div key={item.id} className="p-4 rounded-xl border border-slate-200 bg-slate-50/40 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900">
                        {item.applicant_name}{' '}
                        <span className="text-[10px] font-semibold text-brand-700 bg-brand-50 px-2 py-0.5 rounded-full ml-1">
                          {item.applicant_designation}
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {item.duration_mode.replace('_', ' ')} • {item.leave_category.replace('_', ' ')} •{' '}
                        <strong>{item.total_days} day(s)</strong> ({formatDateSummary(item)})
                      </p>
                    </div>
                    <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border ${getStatusBadge(item.status)}`}>
                      {item.status}
                    </span>
                  </div>

                  <p className="text-xs text-slate-700 bg-white p-3 rounded-lg border border-slate-100">{item.reason}</p>

                  {item.status === 'Pending' && (
                    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                      <input
                        type="text"
                        placeholder="Optional review remarks..."
                        value={remarksMap[item.id] || ''}
                        onChange={(e) => setRemarksMap((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="flex-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs"
                      />
                      <div className="flex items-center space-x-2">
                        <button
                          type="button"
                          disabled={decidingId === item.id}
                          onClick={() => handleDecision(item.id, 'Approved')}
                          className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>Approve</span>
                        </button>
                        <button
                          type="button"
                          disabled={decidingId === item.id}
                          onClick={() => handleDecision(item.id, 'Rejected')}
                          className="px-3.5 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-semibold flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>Reject</span>
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LeavePage;
