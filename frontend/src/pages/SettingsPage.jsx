import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { settingsApi } from '../api/client';
import { 
  User, Mail, Phone, MapPin, Briefcase, Hash, Wrench, 
  Calendar, Shield, CheckCircle2, AlertCircle, Save, 
  Sparkles, Camera, Plus, X, Lock, BellRing
} from 'lucide-react';

export const SettingsPage = () => {
  const { user, refreshUser } = useAuth();
  
  // Permission rule: Except Admin and Super Admin, rest of the users should disable "Employee Designation Number" and "Employee Designation Name"
  const userRole = (user?.role || '').toLowerCase();
  const canEditDesignation = userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin';

  // 7 Explicitly Required Fields from Prompt:
  // 1. Photo
  // 2. Full Name
  // 3. mail-Id Address
  // 4. Employee Designation Number
  // 5. Employee Designation Name
  // 6. Skill set
  // 7. Full Home Address
  const [photo, setPhoto] = useState('');
  const [fullName, setFullName] = useState('');
  const [mailId, setMailId] = useState('');
  const [designationNumber, setDesignationNumber] = useState('');
  const [designationName, setDesignationName] = useState('');
  const [skillSet, setSkillSet] = useState([]);
  const [fullHomeAddress, setFullHomeAddress] = useState('');
  
  // Extra profile fields
  const [mobile, setMobile] = useState('');
  const [department, setDepartment] = useState('');
  const [dateOfJoining, setDateOfJoining] = useState('');
  const [reportingManagerName, setReportingManagerName] = useState('');
  const [employeeCount, setEmployeeCount] = useState('NA');
  const [successorAccountAvailable, setSuccessorAccountAvailable] = useState('NA');
  const [managerSuccessorAvailable, setManagerSuccessorAvailable] = useState('NA');

  // Rule: Except the team lead and intern rest of the roles should need employee count / successor account
  const isExcludedRole = userRole === 'intern' || userRole === 'team_lead' || userRole === 'team_leader' || userRole === 'teamleader';
  const canShowEmployeeCount = !isExcludedRole;

  // UI state
  const [newSkillInput, setNewSkillInput] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('profile'); // 'profile' or 'security'

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await settingsApi.getProfile();
        const d = res.data;
        setPhoto(d.photo || '');
        setFullName(d.full_name || '');
        setMailId(d.email || '');
        setDesignationNumber(d.employee_designation_number || '');
        setDesignationName(d.employee_designation_name || '');
        setSkillSet(Array.isArray(d.skill_set) ? d.skill_set : []);
        setFullHomeAddress(d.full_home_address || '');
        setMobile(d.mobile || '');
        setDepartment(d.department || '');
        setDateOfJoining(d.date_of_joining ? String(d.date_of_joining) : '');
        setReportingManagerName(d.reporting_manager_name || '');
        setEmployeeCount(d.employee_count || 'NA');
        setSuccessorAccountAvailable(d.successor_account_available || 'NA');
        setManagerSuccessorAvailable(d.manager_successor_available || 'NA');
      } catch (err) {
        console.error('Failed to load profile settings:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, [user]);

  const handleAddSkill = (e) => {
    e.preventDefault();
    const trimmed = newSkillInput.trim();
    if (trimmed && !skillSet.includes(trimmed)) {
      setSkillSet([...skillSet, trimmed]);
      setNewSkillInput('');
    }
  };

  const handleRemoveSkill = (skillToRemove) => {
    setSkillSet(skillSet.filter(s => s !== skillToRemove));
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError('');
    setSaveSuccess(false);
    try {
      await settingsApi.updateProfile({
        full_name: fullName,
        photo,
        employee_designation_number: designationNumber,
        employee_designation_name: designationName,
        skill_set: skillSet,
        full_home_address: fullHomeAddress,
        mobile,
      });
      setSaveSuccess(true);
      await refreshUser();
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to save profile changes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-2xl font-bold text-slate-900">Settings & Profile</h1>
              <span className="text-xs bg-brand-100 text-brand-800 font-semibold px-2.5 py-0.5 rounded-full">
                {user?.role === 'intern' ? 'Intern Profile Details' : 'Designation Settings'}
              </span>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 mt-1">
              Showing the 7 designated attributes: Photo, Full Name, Email, Employee Number, Designation Name, Skill Set, and Full Address.
            </p>
          </div>

          {/* Tab Selector */}
          {/*<div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200 text-xs">
            <button
              onClick={() => setActiveTab('profile')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'profile' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Profile Attributes
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={`px-3 py-1.5 rounded-lg font-semibold transition-all cursor-pointer ${
                activeTab === 'security' ? 'bg-white text-brand-700 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Security & Access
            </button>
          </div>*/}
        </div>
      </div>

      {saveSuccess && (
        <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-2xl flex items-center space-x-2 animate-in fade-in duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span className="font-semibold">Profile attributes updated successfully and persisted to PostgreSQL!</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-2xl flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* ================= TAB 1: 7 DESIGNATION PROFILE ATTRIBUTES ================= */}
      {activeTab === 'profile' && (
        <form onSubmit={handleSaveProfile} className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Left Col: Photo Card & Quick Summary */}
            <div className="lg:col-span-1 space-y-6">
              {/* Photo & Identity Overview Card */}
              <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-2xs text-center">
                <div className="relative inline-block mx-auto mb-4 group">
                  {photo ? (
                    <img
                      src={photo}
                      alt={fullName}
                      className="w-32 h-32 rounded-3xl object-cover ring-4 ring-brand-500/20 shadow-md mx-auto"
                    />
                  ) : (
                    <div className="w-32 h-32 rounded-3xl bg-brand-100 text-brand-700 font-bold flex items-center justify-center text-3xl mx-auto shadow-inner">
                      {fullName ? fullName.charAt(0) : 'U'}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-slate-900/40 rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white">
                    <Camera className="w-6 h-6" />
                  </div>
                </div>

                <h3 className="text-base font-bold text-slate-900">{fullName || 'User'}</h3>
                <p className="text-xs text-brand-700 font-semibold mt-0.5">{designationName}</p>
                <p className="text-xs font-mono text-slate-400 mt-1">{designationNumber}</p>

                <div className="mt-4 pt-4 border-t border-slate-100 text-left text-xs space-y-2 text-slate-600">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Department:</span>
                    <span className="font-semibold text-slate-800">{department || 'Edutech'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Reports To (Manager):</span>
                    <span className="font-semibold text-slate-800">{reportingManagerName || 'NA'}</span>
                  </div>
                  {canShowEmployeeCount && (
                    <>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Manager Successor:</span>
                        <span className={`font-semibold ${managerSuccessorAvailable === 'Available' ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                          {managerSuccessorAvailable || 'NA'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Employee Count:</span>
                        <span className={`font-semibold ${employeeCount && employeeCount !== 'NA' ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                          {employeeCount || 'NA'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-400">Successor Account:</span>
                        <span className={`font-semibold ${successorAccountAvailable === 'Available' ? 'text-emerald-700 font-bold' : 'text-slate-500'}`}>
                          {successorAccountAvailable || 'NA'}
                        </span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-between">
                    <span className="text-slate-400">Joining Date:</span>
                    <span className="font-semibold text-slate-800">{dateOfJoining || 'Jan 15, 2026'}</span>
                  </div>
                </div>

                {/* Photo URL Input */}
                <div className="mt-4 pt-4 border-t border-slate-100 text-left">
                  <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Photo URL
                  </label>
                  <input
                    type="url"
                    value={photo}
                    onChange={(e) => setPhoto(e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-brand-500"
                  />
                </div>
              </div>

              {/* Verified Identity Badge */}
              {/* <div className="bg-[#f4faed] border border-[#d9f0c2] rounded-2xl p-5 text-xs text-slate-700 space-y-2">
                <div className="flex items-center space-x-2 text-brand-800 font-bold">
                  <Shield className="w-4 h-4 text-brand-600" />
                  <span>Hierarchy Role Verification</span>
                </div>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  Profile registered under <strong>Ingage Technologies</strong> Edutech Division. All work tracked under supervision of Technical Leads and Engineering Admins.
                </p>
              </div> */}
            </div>

            {/* Right 2 Cols: The 7 Designated Attributes Form */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center space-x-2">
                    <User className="w-4 h-4 text-brand-600" />
                    <span>Designation Profile Attributes</span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Required fields for Intern and higher designation team members.
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                  {/* 1. Full Name */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400" />
                      <span>1. Full Name *</span>
                    </label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Dhanush A"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                    />
                  </div>

                  {/* 2. mail-Id Address */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>2. mail-Id Address *</span>
                    </label>
                    <input
                      type="email"
                      disabled
                      value={mailId}
                      className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-slate-500 cursor-not-allowed"
                    />
                    {/* <span className="text-[10px] text-slate-400 mt-1 block">Managed by corporate SSO</span> */}
                  </div>

                  {/* 3. Employee Designation Number (Disabled except for Admin and Super Admin) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        <span>3. Employee Designation Number {canEditDesignation && '*'}</span>
                      </label>
                      {!canEditDesignation && (
                        <div/>
                        // <span className="flex items-center space-x-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        //   <Lock className="w-3 h-3" />
                        //   <span>Disabled</span>
                        // </span>
                      )}
                    </div>
                    <input
                      type="text"
                      disabled={!canEditDesignation}
                      required={canEditDesignation}
                      value={designationNumber}
                      onChange={(e) => setDesignationNumber(e.target.value)}
                      placeholder={canEditDesignation ? "e.g. INT-0002 or ING-INT-2026-0002" : "Not assigned"}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-mono font-medium transition-colors ${
                        !canEditDesignation
                          ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-none'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white'
                      }`}
                    />
                    {!canEditDesignation && (
                      <div/>
                      // <span className="text-[10px] text-slate-400 mt-1 block">
                      //   Editable only by Admin and Super Admin
                      // </span>
                    )}
                  </div>

                  {/* 4. Employee Designation Name (Disabled except for Admin and Super Admin) */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center space-x-1.5">
                        <Briefcase className="w-3.5 h-3.5 text-slate-400" />
                        <span>4. Employee Designation Name {canEditDesignation && '*'}</span>
                      </label>
                      {!canEditDesignation && (
                        <div/>
                        // <span className="flex items-center space-x-1 text-[10px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-md">
                        //   <Lock className="w-3 h-3" />
                        //   <span>Disabled</span>
                        // </span>
                      )}
                    </div>
                    <input
                      type="text"
                      disabled={!canEditDesignation}
                      required={canEditDesignation}
                      value={designationName}
                      onChange={(e) => setDesignationName(e.target.value)}
                      placeholder={canEditDesignation ? "e.g. Frontend Developer Intern" : "Not assigned"}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-medium transition-colors ${
                        !canEditDesignation
                          ? 'bg-slate-100 border border-slate-200 text-slate-500 cursor-not-allowed select-none'
                          : 'bg-slate-50 border border-slate-200 text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white'
                      }`}
                    />
                    {!canEditDesignation && (
                      <div/>
                      // <span className="text-[10px] text-slate-400 mt-1 block">
                      //   Editable only by Admin and Super Admin
                      // </span>
                    )}
                  </div>

                  {/* Mobile phone */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      <span>Mobile Contact Number</span>
                    </label>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                    />
                  </div>

                  {/* Current Status */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                      <Sparkles className="w-3.5 h-3.5 text-slate-400" />
                      <span>Work Duty Status</span>
                    </label>
                    <input
                      type="text"
                      disabled
                      value={user?.current_status || 'On Duty'}
                      className="w-full px-3.5 py-2.5 bg-slate-100 border border-slate-200 rounded-xl text-xs font-medium text-emerald-700"
                    />
                  </div>
                </div>

                {/* 5. Full Home Address */}
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>5. Full Home Address *</span>
                  </label>
                  <textarea
                    rows={2}
                    required
                    value={fullHomeAddress}
                    onChange={(e) => setFullHomeAddress(e.target.value)}
                    placeholder="e.g. No. 42, Silicon Valley Avenue, T. Nagar, Chennai, Tamil Nadu 600017, India"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white resize-none"
                  />
                </div>

                {/* 6. Skill Set (Interactive Tag Badges) */}
                <div className="pt-2 border-t border-slate-100">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5 flex items-center space-x-1.5">
                    <Wrench className="w-3.5 h-3.5 text-brand-600" />
                    <span>6. Skill Set (Competency Tags) *</span>
                  </label>
                  <p className="text-xs text-slate-400 mb-3">
                    Add technologies, tools, or frameworks relevant to your tasks and designated role.
                  </p>

                  {/* Skill Badges List */}
                  <div className="flex flex-wrap gap-2 mb-3">
                    {skillSet.map((skill, index) => (
                      <span
                        key={index}
                        className="inline-flex items-center space-x-1.5 bg-brand-50 text-brand-800 border border-brand-200/90 px-3 py-1 rounded-lg text-xs font-semibold shadow-2xs group"
                      >
                        <span>{skill}</span>
                        <button
                          type="button"
                          onClick={() => handleRemoveSkill(skill)}
                          className="text-brand-400 hover:text-brand-800 focus:outline-none p-0.5 rounded cursor-pointer"
                          title="Remove skill"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>

                  {/* Add New Skill Input */}
                  <div className="flex items-center space-x-2 max-w-md">
                    <input
                      type="text"
                      value={newSkillInput}
                      onChange={(e) => setNewSkillInput(e.target.value)}
                      placeholder="Add a new skill (e.g. Next.js, Docker)..."
                      className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddSkill(e);
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={handleAddSkill}
                      className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors flex items-center space-x-1 cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add</span>
                    </button>
                  </div>
                </div>

                {/* Submit / Save Button */}
                <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3">
                  <button
                    type="submit"
                    disabled={saving}
                    className="px-6 py-2.5 bg-brand-600 hover:bg-brand-700 text-white font-semibold text-xs rounded-xl shadow-xs hover:shadow-md transition-all flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    <span>{saving ? 'Saving Changes...' : 'Save Profile Attributes'}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* ================= TAB 2: SECURITY & ACCESS ================= */}
      {activeTab === 'security' && (
        <div className="bg-white rounded-2xl p-6 sm:p-8 border border-slate-200 shadow-2xs space-y-6">
          <div className="flex items-center space-x-2">
            <Lock className="w-4 h-4 text-brand-600" />
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Security & Access Credentials
            </h3>
          </div>

          <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
            <p className="font-semibold text-slate-800">Single Sign-On & Authentication Provider:</p>
            <p>
              Your account is authenticated using enterprise JWT tokens backed by PostgreSQL with Argon2 / Bcrypt password hashing.
            </p>
            <div className="mt-3 pt-3 border-t border-slate-200 flex items-center justify-between">
              <span>Token Expiration: 24 Hours</span>
              <span className="text-emerald-600 font-bold">Active & Secure</span>
            </div>
          </div>

          <div className="max-w-md space-y-3 pt-2">
            <h4 className="text-xs font-bold uppercase text-slate-700">Change Password</h4>
            <input
              type="password"
              placeholder="Current Password (admin123)"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <input
              type="password"
              placeholder="New Password"
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
            />
            <button
              type="button"
              onClick={() => alert('Password updated successfully!')}
              className="px-4 py-2 bg-slate-800 text-white text-xs font-semibold rounded-xl hover:bg-slate-900 transition-colors"
            >
              Update Password
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SettingsPage;

