import React, { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { teamApi } from '../api/client';
import { 
  Users, Shield, Award, Mail, Phone, MapPin, 
  ChevronRight, ArrowDown, Building2, GraduationCap, 
  CheckCircle, Briefcase, Sparkles, Send, UserPlus, X,
  AlertCircle, Check, Loader2, Lock, KeyRound, Eye, EyeOff, RefreshCw, Copy
} from 'lucide-react';

export const TeamPage = () => {
  const { user } = useAuth();
  const [hierarchy, setHierarchy] = useState(null);
  const [loading, setLoading] = useState(true);

  // Modal & form states for creating users under successor designation
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');

  // Form state for creating users under successor designation
  const [formData, setFormData] = useState({
    full_name: '',
    email: '',
    password: '',
    role: '',
    designation_name: '',
    designation_number: '',
    department: 'Edutech',
    mobile: '',
  });

  const fetchHierarchy = async () => {
    try {
      setLoading(true);
      const res = await teamApi.getHierarchy();
      setHierarchy(res.data);
    } catch (err) {
      console.error('Failed to load team hierarchy:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHierarchy();
  }, [user]);

  const userRole = (user?.role || '').toLowerCase();
  const userRoleNorm = userRole.replace(' ', '_');
  const isSuperAdmin = userRoleNorm === 'super_admin' || userRoleNorm === 'superadmin';
  const isAdmin = userRoleNorm === 'admin';
  const isTeamLead = userRoleNorm === 'team_lead' || userRoleNorm === 'team_leader' || userRoleNorm === 'teamleader';
  const isHR = userRoleNorm === 'hr' || userRoleNorm === 'human_resource_manager';
  const canCreateUser = isSuperAdmin || isAdmin;
  const isIntern = userRole === 'intern';

  // Role-restricted subordinate password reset state
  const [resetTarget, setResetTarget] = useState(null);
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirm, setResetConfirm] = useState('');
  const [resetMustChange, setResetMustChange] = useState(true);
  const [showResetPw, setShowResetPw] = useState(false);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetError, setResetError] = useState('');
  const [resetSuccess, setResetSuccess] = useState('');
  const [copiedResetPw, setCopiedResetPw] = useState(false);

  const canResetMemberPassword = (member) => {
    if (!member || member.id === user?.id || isIntern) return false;
    const targetRole = (member.role || '').toLowerCase().replace(' ', '_');
    if (isSuperAdmin) return targetRole !== 'super_admin' && targetRole !== 'superadmin';
    if (isAdmin) return targetRole !== 'super_admin' && targetRole !== 'superadmin' && targetRole !== 'admin';
    if (isTeamLead) return targetRole === 'intern';
    if (isHR) return targetRole === 'hr_intern' || targetRole === 'human_resource_intern' || member.reporting_manager_id === user?.id;
    return false;
  };

  const generateTempPassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$';
    const bytes = new Uint32Array(12);
    window.crypto.getRandomValues(bytes);
    const pw = Array.from(bytes, (b) => chars[b % chars.length]).join('');
    setResetPassword(pw);
    setResetConfirm(pw);
    setShowResetPw(true);
    setCopiedResetPw(false);
  };

  const handleOpenResetModal = (member) => {
    setResetTarget(member);
    setResetPassword('');
    setResetConfirm('');
    setResetMustChange(true);
    setShowResetPw(false);
    setResetError('');
    setResetSuccess('');
    setCopiedResetPw(false);
  };

  const handleResetPasswordSubmit = async (e) => {
    e.preventDefault();
    if (!resetTarget) return;
    setResetError('');
    setResetSuccess('');

    if (!resetPassword || resetPassword.length < 6) {
      setResetError('Temporary password must be at least 6 characters.');
      return;
    }
    if (resetPassword !== resetConfirm) {
      setResetError('Passwords do not match.');
      return;
    }

    try {
      setResetSubmitting(true);
      const res = await teamApi.resetUserPassword(resetTarget.id, resetPassword, resetMustChange);
      setResetSuccess(res.data?.message || `Password reset successfully for ${resetTarget.full_name}.`);
    } catch (err) {
      setResetError(err.response?.data?.detail || 'Failed to reset password.');
    } finally {
      setResetSubmitting(false);
    }
  };

  // Allowed successor designations strictly based on user hierarchy rules:
  // - Super Admin can allocate: Admin, Human Resource Manager, Team Lead, Intern (NOT Super Admin)
  // - Admin can allocate: Human Resource Manager, Team Lead, Intern (NOT Super Admin, NOT Admin)
  const allowedRoles = useMemo(() => {
    if (isSuperAdmin) {
      return [
        { value: 'admin', label: 'Admin', desc: 'Direct Successor Designation' },
        { value: 'hr', label: 'Human Resource Manager', desc: 'Successor Designation' },
        { value: 'team_lead', label: 'Team Lead', desc: 'Successor Designation' },
        { value: 'intern', label: 'Intern', desc: 'Successor Designation' },
      ];
    }
    if (isAdmin) {
      return [
        { value: 'hr', label: 'Human Resource Manager', desc: 'Direct Successor Designation' },
        { value: 'team_lead', label: 'Team Lead', desc: 'Successor Designation' },
        { value: 'intern', label: 'Intern', desc: 'Successor Designation' },
      ];
    }
    return [];
  }, [isSuperAdmin, isAdmin]);

  const handleOpenCreateModal = () => {
    setFormData({
      full_name: '',
      email: '',
      password: '',
      role: allowedRoles[0]?.value || 'team_lead',
      designation_name: '',
      designation_number: '',
      department: 'Edutech',
      mobile: '',
    });
    setFormError('');
    setFormSuccess('');
    setShowCreateModal(true);
  };

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setFormError('');
    setFormSuccess('');

    if (!formData.full_name.trim()) {
      setFormError('Please enter full name.');
      return;
    }
    if (!formData.email.trim()) {
      setFormError('Please enter a valid email address.');
      return;
    }
    if (!formData.password || formData.password.length < 6) {
      setFormError('Password must be at least 6 characters.');
      return;
    }
    if (!formData.role) {
      setFormError('Please select a successor designation role.');
      return;
    }

    try {
      setSubmitting(true);
      const payload = {
        full_name: formData.full_name.trim(),
        email: formData.email.trim(),
        password: formData.password,
        role: formData.role,
        designation_name: formData.designation_name.trim() || undefined,
        designation_number: formData.designation_number.trim() || undefined,
        department: formData.department || 'Edutech',
        mobile: formData.mobile.trim() || undefined,
      };

      const res = await teamApi.createUser(payload);
      setFormSuccess(res.data?.message || 'User created successfully under successor designation!');

      // Refresh team hierarchy
      await fetchHierarchy();

      setTimeout(() => {
        setShowCreateModal(false);
        setFormSuccess('');
      }, 1500);
    } catch (err) {
      console.error('Failed to create user:', err);
      const msg = err.response?.data?.detail || 'Failed to create user. Please verify inputs and try again.';
      setFormError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  // 1. Single 1st Above Hierarchy Officer (Immediate Superior / 1 Predecessor)
  const firstAboveOfficer = useMemo(() => {
    if (!hierarchy?.predecessors || hierarchy.predecessors.length === 0) return null;
    return hierarchy.predecessors[0];
  }, [hierarchy]);

  // 2. Corresponding Team Members for the role
  const teamMembers = useMemo(() => {
    if (!hierarchy) return [];
    if (userRole === 'intern') {
      // In the Intern they can see their corresponding team member (fellow interns under same team lead)
      return hierarchy.peers || [];
    }
    if (userRole === 'team_lead') {
      // If I login into team_lead, i should see only my corresponding intern members
      return (hierarchy.successors || []).filter(m => {
        const r = (m.role || '').toLowerCase().replace(' ', '_');
        return r === 'intern';
      });
    }
    if (userRole === 'hr' || userRole === 'human_resource_manager' || (user?.designation && user.designation.toLowerCase().includes('human resource'))) {
      // Rule 4: HR has 0 successor team members by default (super_admin -> hr)
      return [];
    }
    if (userRole === 'admin') {
      // If I login into admin, on the team page, I should see only my corresponding "team_lead"
      // [not all the team lead irrespective of other admin team lead]
      return (hierarchy.successors || []).filter(m => {
        const r = (m.role || '').toLowerCase().replace(' ', '_');
        return r === 'team_lead';
      });
    }
    if (isSuperAdmin) {
      // If I login into superadmin, on the team member page, I should see only the admin
      return (hierarchy.successors || []).filter(m => {
        const r = (m.role || '').toLowerCase().replace(' ', '_');
        return r === 'admin';
      });
    }
    return hierarchy.successors || hierarchy.peers || [];
  }, [hierarchy, userRole, isSuperAdmin, user]);

  // Successor popup state for Superadmin and Admin:
  // - Superadmin: Click Admin profile -> popup showing that Admin's following successor employee (Team Lead)
  // - Admin: Click Team Lead profile -> popup showing that Team Lead's following successor employee (Intern members)
  const [successorPopupData, setSuccessorPopupData] = useState(null);
  const [isSuccessorPopupOpen, setIsSuccessorPopupOpen] = useState(false);

  const handleMemberClick = (member) => {
    if (!member) return;
    const roleNorm = (member.role || '').toLowerCase().replace(' ', '_');
    const allMembers = [
      ...(hierarchy?.successors || []),
      ...(hierarchy?.peers || [])
    ];

    if (isSuperAdmin && roleNorm === 'admin') {
      // Super Admin clicked an Admin -> popup 1st following successor (Team Lead)
      const teamLeads = allMembers.filter(m => {
        const r = (m.role || '').toLowerCase().replace(' ', '_');
        return r === 'team_lead' && m.reporting_manager_id === member.id;
      });

      setSuccessorPopupData({
        parentMember: member,
        title: '1st Following Successor: Team Lead',
        roleBadge: 'Team Lead',
        badgeColor: 'bg-amber-100 text-amber-800 border-amber-200',
        members: teamLeads,
        emptyMessage: `No Team Leads currently assigned under ${member.full_name}.`,
        isLeaf: false,
      });
      setIsSuccessorPopupOpen(true);
      return;
    }

    if (isAdmin && roleNorm === 'team_lead') {
      // Admin clicked their Team Lead -> popup following successor (Intern members)
      const interns = allMembers.filter(m => {
        const r = (m.role || '').toLowerCase().replace(' ', '_');
        return r === 'intern' && m.reporting_manager_id === member.id;
      });

      setSuccessorPopupData({
        parentMember: member,
        title: 'Following Successor: Intern Members',
        roleBadge: 'Intern',
        badgeColor: 'bg-brand-100 text-brand-800 border-brand-200',
        members: interns,
        emptyMessage: `No Interns currently assigned under ${member.full_name}.`,
        isLeaf: true,
      });
      setIsSuccessorPopupOpen(true);
      return;
    }
  };

  const getRoleBadge = (role) => {
    switch (role?.toLowerCase()) {
      case 'super_admin':
        return { label: 'Super Admin', color: 'bg-purple-100 text-purple-800 border-purple-200' };
      case 'admin':
        return { label: 'Admin', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'hr':
      case 'human_resource_manager':
        return { label: 'Human Resource Manager', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'team_lead':
        return { label: 'Team Lead', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'intern':
      default:
        return { label: 'Intern', color: 'bg-brand-100 text-brand-800 border-brand-200' };
    }
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-slate-900">Team Members</h1>
              {/* <span className="text-xs bg-brand-100 text-brand-800 font-semibold px-2.5 py-0.5 rounded-full">
                Hierarchy View
              </span> */}
            </div>
            {/* <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Showing your corresponding team members and your direct 1st above hierarchy reporting officer.
            </p> */}
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canCreateUser && (
              <button
                type="button"
                onClick={handleOpenCreateModal}
                className="inline-flex items-center space-x-2 px-3.5 py-1.5 bg-brand-600 hover:bg-brand-700 text-white text-xs sm:text-sm font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Create User</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ================= 1. ONLY 1ST ABOVE HIERARCHY OFFICER ================= */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <span>Lead Officer</span>
            {firstAboveOfficer && (
              <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border ${getRoleBadge(firstAboveOfficer.role).color}`}>
                ★ {getRoleBadge(firstAboveOfficer.role).label}
              </span>
            )}
          </h2>
          {/* <p className="text-xs text-slate-500">
            {isIntern 
              ? 'Your immediate 1st above hierarchy reporting officer (Team Lead).'
              : userRole === 'team_lead'
              ? 'Your immediate 1st above hierarchy reporting officer (Admin).'
              : (userRole === 'admin' || userRole === 'hr' || userRole === 'human_resource_manager')
              ? 'Your immediate 1st above hierarchy reporting officer (Super Admin).'
              : 'Executive leadership level (top-level operational authority over hierarchy).'}
          </p> */}
        </div>

        {firstAboveOfficer ? (
          <div className="bg-white rounded-2xl p-6 sm:p-7 border border-brand-300 ring-2 ring-brand-500/10 shadow-sm max-w-2xl hover:shadow-md transition-all">
            {/* Top Bar with Designation Badge */}
            <div className="flex items-center justify-between mb-4">
              <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full border ${getRoleBadge(firstAboveOfficer.role).color}`}>
                {getRoleBadge(firstAboveOfficer.role).label}
              </span>
              <span className="text-[10px] font-bold bg-brand-600 text-white px-2.5 py-0.5 rounded-full shadow-2xs">
                ★ Lead Officer
              </span>
            </div>

            {/* Profile Header */}
            <div className="flex items-center space-x-4 mb-4">
              {firstAboveOfficer.photo ? (
                <img
                  src={firstAboveOfficer.photo}
                  alt={firstAboveOfficer.full_name}
                  className="w-16 h-16 rounded-2xl object-cover ring-2 ring-slate-100 shadow-xs shrink-0"
                />
              ) : (
                <div className="w-16 h-16 rounded-2xl bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-xl shrink-0">
                  {firstAboveOfficer.full_name?.charAt(0) || 'U'}
                </div>
              )}
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">{firstAboveOfficer.full_name}</h3>
                <p className="text-xs text-brand-700 font-semibold truncate">{firstAboveOfficer.designation_name}</p>
                <p className="text-[11px] font-mono text-slate-400 mt-0.5">{firstAboveOfficer.designation_number}</p>
              </div>
            </div>

            {/* Contact Info List */}
            <div className="space-y-2 py-3 border-t border-slate-100 text-xs text-slate-600">
              <div className="flex items-center space-x-2 truncate">
                <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <a href={`mailto:${firstAboveOfficer.email}`} className="hover:text-brand-700 truncate">
                  {firstAboveOfficer.email}
                </a>
              </div>
              <div className="flex items-center space-x-2">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                <span>Edutech HQ • Chennai Campus</span>
              </div>
            </div>

            {/* Skills tags */}
            {firstAboveOfficer.skills?.length > 0 && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1.5">
                  Core Competencies
                </span>
                <div className="flex flex-wrap gap-1">
                  {firstAboveOfficer.skills.slice(0, 4).map((sk, i) => (
                    <span
                      key={i}
                      className="text-[10px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded-md font-medium"
                    >
                      {sk}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Quick Action Button */}
            <div className="mt-5 pt-3 border-t border-slate-100 flex items-center space-x-3">
              <a
                href="#chat"
                className="flex-1 py-2 bg-brand-600 hover:bg-brand-700 text-white text-xs font-semibold rounded-xl transition-colors flex items-center justify-center space-x-1.5 shadow-xs"
              >
                <Send className="w-3 h-3" />
                <span>Message</span>
              </a>
              <a
                href={`mailto:${firstAboveOfficer.email}?subject=Hierarchy Inquiry`}
                className="py-2 px-4 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-xl border border-slate-200 transition-colors flex items-center justify-center space-x-1.5"
              >
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>Email</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center text-xs text-slate-400 max-w-2xl">
            <Shield className="w-10 h-10 text-slate-300 mb-2" />
            <span className="font-bold text-slate-700 text-sm">Executive Leadership Level</span>
            <span className="text-xs text-slate-500 mt-1 max-w-md leading-relaxed">
              Super Admin holds top-level authority over the operational engineering pipeline. There is no higher designation officer in the hierarchy.
            </span>
          </div>
        )}
      </div>

      {/* ================= 2. ONLY CORRESPONDING TEAM MEMBERS ================= */}
      <div>
        <div className="mb-4">
          <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
            <span>Team Members</span>
            <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-brand-100 text-brand-800">
              {teamMembers.length} {teamMembers.length === 1 ? 'Member' : 'Members'}
            </span>
          </h2>
          {/* <p className="text-xs text-slate-500">
            {isIntern 
              ? 'Your corresponding fellow team members reporting under the same 1st above hierarchy officer.'
              : userRole === 'team_lead'
              ? 'Your corresponding associate interns and team members reporting to your leadership.'
              : userRole === 'admin'
              ? 'Your corresponding team leads and technical personnel in your division.'
              : isSuperAdmin
              ? 'Your corresponding direct reports and departmental managers across the organization.'
              : 'Human Resource Manager reports directly to Super Admin (0 successors by default per Rule 4).'}
          </p> */}
        </div>

        {teamMembers.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {teamMembers.map((member) => {
              const badge = getRoleBadge(member.role);
              const canOpenPopup = (isSuperAdmin && (member.role || '').toLowerCase() === 'admin') ||
                                   (isAdmin && (member.role || '').toLowerCase() === 'team_lead');
              return (
                <div
                  key={member.id}
                  onClick={() => canOpenPopup && handleMemberClick(member)}
                  className={`bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between ${
                    canOpenPopup ? 'cursor-pointer hover:border-brand-300 ring-1 ring-transparent hover:ring-brand-200' : ''
                  }`}
                >
                  <div>
                    {/* Role badge */}
                    <div className="flex items-center justify-between mb-3">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${badge.color}`}>
                        {badge.label}
                      </span>
                      {member.current_status && (
                        <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                          {member.current_status}
                        </span>
                      )}
                    </div>

                    {/* Member Profile */}
                    <div className="flex items-center space-x-3 mb-3">
                      {member.photo ? (
                        <img
                          src={member.photo}
                          alt={member.full_name}
                          className="w-12 h-12 rounded-xl object-cover ring-1 ring-slate-200 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 font-bold flex items-center justify-center text-sm shrink-0">
                          {member.full_name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <h4 className="text-xs font-bold text-slate-900 truncate">{member.full_name}</h4>
                        <p className="text-[11px] text-brand-700 font-medium truncate">{member.designation_name}</p>
                        <p className="text-[10px] text-slate-400 font-mono">{member.designation_number}</p>
                      </div>
                    </div>

                    {/* Member details / active tasks */}
                    <div className="p-2.5 bg-slate-50 rounded-xl text-xs space-y-1 mb-2">
                      <div className="flex justify-between text-slate-600">
                        <span>Email:</span>
                        <span className="font-medium text-slate-800 truncate ml-2 max-w-[170px]">{member.email}</span>
                      </div>
                      {member.active_tasks_count !== undefined && (
                        <div className="flex justify-between text-slate-600">
                          <span>Active Tasks:</span>
                          <span className="font-bold text-slate-800">{member.active_tasks_count} tasks</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Card Footer with Successor popup button & Quick Chat Action */}
                  <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                    {isSuperAdmin && (member.role || '').toLowerCase() === 'admin' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMemberClick(member);
                        }}
                        className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg border border-brand-200 transition-colors flex items-center space-x-1 cursor-pointer"
                        title="View Team Lead reporting under this Admin"
                      >
                        <Users className="w-3 h-3 text-brand-600" />
                        <span>View Team Lead</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : isAdmin && (member.role || '').toLowerCase() === 'team_lead' ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleMemberClick(member);
                        }}
                        className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg border border-brand-200 transition-colors flex items-center space-x-1 cursor-pointer"
                        title="View Intern members reporting under this Team Lead"
                      >
                        <Users className="w-3 h-3 text-brand-600" />
                        <span>View Interns</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    ) : (
                      <span className="text-[11px] text-slate-400">Edutech Division</span>
                    )}

                    <div className="flex items-center space-x-2">
                      {canResetMemberPassword(member) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenResetModal(member);
                          }}
                          className="text-[11px] font-semibold text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100 px-2.5 py-1 rounded-lg border border-amber-200 transition-colors flex items-center space-x-1 cursor-pointer"
                          title={`Reset password for ${member.full_name}`}
                        >
                          <KeyRound className="w-3 h-3" />
                          <span>Reset PW</span>
                        </button>
                      )}
                      <a
                        href="#chat"
                        onClick={(e) => e.stopPropagation()}
                        className="text-[11px] font-semibold text-brand-600 hover:text-brand-800 bg-brand-50 hover:bg-brand-100 px-2.5 py-1 rounded-lg border border-brand-200 transition-colors flex items-center space-x-1"
                      >
                        <Send className="w-3 h-3" />
                        <span>Chat</span>
                      </a>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="bg-slate-50 rounded-2xl p-8 border border-dashed border-slate-200 text-center flex flex-col items-center justify-center text-xs text-slate-400 max-w-2xl">
            <Users className="w-8 h-8 text-slate-300 mb-2" />
            <span className="font-semibold text-slate-700 text-sm">
              {userRole === 'hr' || userRole === 'human_resource_manager'
                ? 'Human Resource Manager: 0 Subordinate Successors'
                : 'No Team Members Assigned'}
            </span>
            <span className="text-xs text-slate-500 mt-1 max-w-sm leading-relaxed">
              {userRole === 'hr' || userRole === 'human_resource_manager'
                ? 'Reports directly to Super Admin with 0 successors by default (Rule 4: super_admin → hr). Successor accounts can be created by Super Admin or Admin if needed.'
                : 'No team members are currently assigned under this position.'}
            </span>
          </div>
        )}
      </div>

      {/* ================= CREATE USER MODAL ================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full p-6 border border-slate-100 my-8 animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">Create New Team User</h3>
                  <p className="text-xs text-slate-500">Allocate under successor designation</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Role Allocation Authority Explanatory Banner */}
            {/* <div className="my-4 p-3 rounded-xl bg-slate-50 border border-slate-200/80 text-xs text-slate-600 space-y-1">
              <div className="flex items-center space-x-1.5 font-semibold text-slate-800">
                <Shield className="w-3.5 h-3.5 text-brand-600" />
                <span>
                  Logged in as: <span className="capitalize">{userRole.replace('_', ' ')}</span>
                </span>
              </div>
              <p className="text-[11px] text-slate-500 leading-relaxed">
                {isSuperAdmin ? (
                  <>
                    <strong className="text-slate-700">Successor Allocation Rule:</strong> As Super Admin, you can assign users to <span className="font-semibold text-brand-700">Admin, Team Lead, and Intern</span>. Same designation (Super Admin) is restricted.
                  </>
                ) : (
                  <>
                    <strong className="text-slate-700">Successor Allocation Rule:</strong> As Admin, you can assign users to <span className="font-semibold text-brand-700">Team Lead and Intern</span>. Super Admin and Admin designations are restricted.
                  </>
                )}
              </p>
            </div> */}

            {/* Error Message */}
            {formError && (
              <div className="mb-4 p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-start space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
                <span className="leading-snug">{formError}</span>
              </div>
            )}

            {/* Success Message */}
            {formSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center space-x-2">
                <Check className="w-4 h-4 shrink-0 text-emerald-600" />
                <span className="font-semibold">{formSuccess}</span>
              </div>
            )}

            {/* Form */}
            <form onSubmit={handleCreateUser} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={formData.full_name}
                  onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                />
              </div>

              {/* Email & Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="e.g. ramesh@ingage.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Password <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="password"
                    required
                    minLength={6}
                    placeholder="Min 6 characters"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Successor Designation Role Dropdown */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Successor Designation Role <span className="text-red-500">*</span>
                </label>
                <select
                  required
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: e.target.value })}
                  className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                >
                  {allowedRoles.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label} ({r.desc})
                    </option>
                  ))}
                </select>
                <p className="text-[10px] text-slate-400 mt-1">
                  {isSuperAdmin
                    ? 'Only successor roles (Admin, Team Lead, Intern) are selectable.'
                    : 'Only successor roles (Team Lead, Intern) are selectable.'}
                </p>
              </div>

              {/* Designation Name & Number */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Employee Designation Name
                  </label>
                  <input
                    type="text"
                    placeholder={formData.role === 'admin' ? 'Operations Admin' : formData.role === 'team_lead' ? 'Senior Team Lead' : 'Frontend Developer Intern'}
                    value={formData.designation_name}
                    onChange={(e) => setFormData({ ...formData, designation_name: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Employee Designation Number
                  </label>
                  <input
                    type="text"
                    placeholder={formData.role === 'intern' ? 'ING-INT-2026-0005' : 'ING-EMP-2026-0015'}
                    value={formData.designation_number}
                    onChange={(e) => setFormData({ ...formData, designation_number: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Department & Mobile */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Department
                  </label>
                  <select
                    value={formData.department}
                    onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500 bg-white"
                  >
                    <option value="Edutech">Edutech</option>
                    <option value="Ingage">Ingage</option>
                    <option value="Rezov">Rezov</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Mobile Number (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="+91 98765 43210"
                    value={formData.mobile}
                    onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                    className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-brand-500 focus:border-brand-500"
                  />
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center space-x-1.5 px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:opacity-50 text-white text-xs font-semibold rounded-xl shadow-xs transition-colors cursor-pointer"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Create User</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================= 4. SUCCESSOR POPUP MODAL (SUPER ADMIN & ADMIN DRILL-DOWN) ================= */}
      {isSuccessorPopupOpen && successorPopupData && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-xs p-4 animate-in fade-in"
          onClick={() => {
            setIsSuccessorPopupOpen(false);
            setSuccessorPopupData(null);
          }}
        >
          <div 
            className="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-slate-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 rounded-xl bg-brand-50 text-brand-700 font-bold flex items-center justify-center text-base">
                  {successorPopupData.parentMember?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {successorPopupData.parentMember?.full_name}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {successorPopupData.parentMember?.designation_name} • {successorPopupData.title}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsSuccessorPopupOpen(false);
                  setSuccessorPopupData(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center space-x-1.5">
                  <span className="w-2 h-2 rounded-full bg-brand-500"></span>
                  <span>{successorPopupData.title} ({successorPopupData.members.length})</span>
                </h4>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${successorPopupData.badgeColor}`}>
                  {successorPopupData.roleBadge}
                </span>
              </div>

              {successorPopupData.members.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {successorPopupData.members.map((m) => (
                    <div key={m.id} className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-white hover:border-brand-200 hover:shadow-xs transition-all flex items-center space-x-3">
                      {m.photo ? (
                        <img
                          src={m.photo}
                          alt={m.full_name}
                          className="w-10 h-10 rounded-lg object-cover ring-1 ring-slate-200 shadow-2xs shrink-0"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-lg bg-white border border-slate-200 text-slate-700 font-bold flex items-center justify-center text-xs shrink-0">
                          {m.full_name?.charAt(0) || 'U'}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-900 truncate">{m.full_name}</p>
                        <p className="text-[11px] text-brand-700 truncate">{m.designation_name}</p>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mt-0.5">
                          <span>{m.designation_number}</span>
                          {m.email && <span className="font-sans text-slate-500 truncate ml-2 max-w-[120px]">{m.email}</span>}
                        </div>
                      </div>
                      {canResetMemberPassword(m) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleOpenResetModal(m);
                          }}
                          className="p-1.5 rounded-lg text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 transition-colors shrink-0 cursor-pointer"
                          title={`Reset password for ${m.full_name}`}
                        >
                          <KeyRound className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 text-center text-xs text-slate-400">
                  {successorPopupData.emptyMessage}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setIsSuccessorPopupOpen(false);
                  setSuccessorPopupData(null);
                }}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ================= 5. ROLE-RESTRICTED PASSWORD RESET MODAL ================= */}
      {resetTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setResetTarget(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-4 border-b border-slate-100">
              <div className="flex items-center space-x-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center border border-amber-200">
                  <KeyRound className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Reset Member Password</h3>
                  <p className="text-[11px] text-slate-500 truncate max-w-[240px]">
                    {resetTarget.full_name} ({resetTarget.email})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setResetTarget(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleResetPasswordSubmit} className="mt-4 space-y-3.5">
              {resetError && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center space-x-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{resetError}</span>
                </div>
              )}

              {resetSuccess && (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-xl text-xs flex items-center space-x-2">
                  <Check className="w-4 h-4 shrink-0" />
                  <span>{resetSuccess}</span>
                </div>
              )}

              <div className="flex items-center justify-between">
                <span className="text-[11px] font-semibold text-slate-600">Temporary Password</span>
                <div className="flex items-center space-x-2">
                  <button
                    type="button"
                    onClick={generateTempPassword}
                    className="text-[11px] font-semibold text-brand-700 hover:text-brand-900 flex items-center space-x-1 cursor-pointer"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Generate</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowResetPw((prev) => !prev)}
                    className="text-[11px] text-slate-500 hover:text-slate-700 flex items-center space-x-1 cursor-pointer"
                  >
                    {showResetPw ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                    <span>{showResetPw ? 'Hide' : 'Show'}</span>
                  </button>
                </div>
              </div>

              <div className="relative">
                <input
                  type={showResetPw ? 'text' : 'password'}
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  placeholder="Enter new password (min 6 chars)"
                  className="w-full px-3 py-2 pr-9 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
                />
                {resetPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard?.writeText(resetPassword);
                      setCopiedResetPw(true);
                    }}
                    title="Copy temporary password"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {copiedResetPw ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                )}
              </div>

              <input
                type={showResetPw ? 'text' : 'password'}
                value={resetConfirm}
                onChange={(e) => setResetConfirm(e.target.value)}
                placeholder="Confirm new password"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500"
              />

              <label className="flex items-center space-x-2 text-xs text-slate-600 cursor-pointer select-none pt-1">
                <input
                  type="checkbox"
                  checked={resetMustChange}
                  onChange={(e) => setResetMustChange(e.target.checked)}
                  className="rounded border-slate-300 text-brand-600 focus:ring-brand-500"
                />
                <span>Prompt user to change password on next visit to Settings</span>
              </label>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setResetTarget(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Close
                </button>
                <button
                  type="submit"
                  disabled={resetSubmitting}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl disabled:opacity-60 transition-colors flex items-center space-x-1.5 cursor-pointer"
                >
                  {resetSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>{resetSubmitting ? 'Resetting...' : 'Reset Password'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TeamPage;

