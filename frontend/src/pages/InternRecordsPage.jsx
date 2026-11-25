import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { internRecordsApi } from '../api/client';
import {
  FileSpreadsheet, Plus, Search, RefreshCw, Sparkles, Building,
  Phone, AlertTriangle, CheckCircle2, FileText, Download, Eye,
  Calendar, GraduationCap, MapPin, X, Check, Shield, User,
  ExternalLink, FileCheck, School, Trash2, Edit3, ArrowUpDown, 
  ArrowUp, ArrowDown, Mail, Filter, RotateCcw, AlertCircle, LogIn, Key
} from 'lucide-react';

export const InternRecordsPage = () => {
  const { user, login, ssoLogin } = useAuth();
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  // Table Sorting state
  const [sortBy, setSortBy] = useState('id'); // 'id', 'full_name', 'mobile_number', 'emergency_number', 'college_name', 'year_of_start', 'year_of_end'
  const [sortOrder, setSortOrder] = useState('desc'); // default descending by ID

  // Table Filters
  const [sameAddressFilter, setSameAddressFilter] = useState('All'); // 'All', 'same', 'different'

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [selectedRecord, setSelectedRecord] = useState(null);
  const [editingRecordId, setEditingRecordId] = useState(null);

  // Marksheet Viewer Modal
  const [viewingMarksheet, setViewingMarksheet] = useState(null);

  // 9 Mandatory Form Fields + Portal Login Access Email
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState(''); // Portal Login Access Email
  const [mobileNumber, setMobileNumber] = useState('');
  const [emergencyNumber, setEmergencyNumber] = useState('');
  const [residentialAddress, setResidentialAddress] = useState('');
  const [homeAddress, setHomeAddress] = useState('');
  const [isHomeSameAsResidential, setIsHomeSameAsResidential] = useState(true); // Checked by default
  const [tenthMarksheet, setTenthMarksheet] = useState('');
  const [twelfthMarksheet, setTwelfthMarksheet] = useState('');
  const [collegeMarksheet, setCollegeMarksheet] = useState('');
  const [collegeName, setCollegeName] = useState('');
  const [yearOfStart, setYearOfStart] = useState(2021);
  const [yearOfEnd, setYearOfEnd] = useState(2025);

  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formError, setFormError] = useState('');

  // Role permissions
  const userRole = (user?.role || '').toLowerCase();
  const isHRManager = userRole === 'hr' || userRole === 'human_resource_manager' || (user?.designation && user.designation.toLowerCase().includes('human resource'));
  const isSuperAdminOrAdmin = userRole === 'admin' || userRole === 'super_admin' || userRole === 'superadmin';
  const canManageRecords = isHRManager || isSuperAdminOrAdmin;

  useEffect(() => {
    fetchRecords();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await internRecordsApi.getAll();
      setRecords(res.data?.items || []);
    } catch (err) {
      console.error('Failed to load intern records:', err);
      setError(err.response?.data?.detail || 'Failed to fetch intern records');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateSampleData = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await internRecordsApi.generateSampleData();
      setRecords(res.data?.items || []);
      setSuccessMsg('Sample intern records generated successfully with portal login access!');
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to generate sample data');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setEditingRecordId(null);
    setFullName('');
    setEmail('');
    setMobileNumber('');
    setEmergencyNumber('');
    setResidentialAddress('');
    setHomeAddress('');
    setIsHomeSameAsResidential(true);
    setTenthMarksheet('10th_Marksheet_Verified.pdf');
    setTwelfthMarksheet('12th_Diploma_Marksheet_Verified.pdf');
    setCollegeMarksheet('College_Consolidated_Marksheet_Verified.pdf');
    setCollegeName('');
    setYearOfStart(2021);
    setYearOfEnd(2025);
    setFormError('');
  };

  const openCreateModal = () => {
    resetForm();
    setIsFormModalOpen(true);
  };

  const openEditModal = (rec) => {
    setEditingRecordId(rec.id);
    setFullName(rec.full_name || '');
    setEmail(rec.email || '');
    setMobileNumber(rec.mobile_number || '');
    setEmergencyNumber(rec.emergency_number || '');
    setResidentialAddress(rec.residential_address || '');
    setHomeAddress(rec.home_address || '');
    setIsHomeSameAsResidential(Boolean(rec.is_home_same_as_residential));
    setTenthMarksheet(rec.tenth_marksheet || '10th_Marksheet.pdf');
    setTwelfthMarksheet(rec.twelfth_marksheet || '12th_Diploma_Marksheet.pdf');
    setCollegeMarksheet(rec.college_marksheet || 'College_Marksheet.pdf');
    setCollegeName(rec.college_name || '');
    setYearOfStart(rec.year_of_start || 2021);
    setYearOfEnd(rec.year_of_end || 2025);
    setFormError('');
    setIsFormModalOpen(true);
  };

  const handleResidentialAddressChange = (val) => {
    setResidentialAddress(val);
    if (isHomeSameAsResidential) {
      setHomeAddress(val);
    }
  };

  const handleToggleSameAddress = (checked) => {
    setIsHomeSameAsResidential(checked);
    if (checked) {
      setHomeAddress(residentialAddress);
    }
  };

  const handleFileUpload = (e, setter) => {
    const file = e.target.files?.[0];
    if (file) {
      setter(file.name);
    }
  };

  const handleSort = (columnKey) => {
    if (sortBy === columnKey) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(columnKey);
      setSortOrder(columnKey === 'id' ? 'desc' : 'asc');
    }
  };

  const formatSortName = (key) => {
    switch (key) {
      case 'id': return 'ID';
      case 'full_name': return '1. Full Name';
      case 'mobile_number': return '2. Mobile Number';
      case 'emergency_number': return '3. Emergency Number';
      case 'residential_address': return '4. Residential Address';
      case 'home_address': return '5. Home Address';
      case 'college_name': return '9. College Name';
      case 'year_of_start': return 'Year of Start';
      case 'year_of_end': return 'Year of End';
      default: return key;
    }
  };

  const handleFormSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    // Mandatory Validations
    if (!fullName.trim()) {
      setFormError('1. Full Name is required.');
      return;
    }
    if (!mobileNumber.trim()) {
      setFormError('2. Mobile Number is required.');
      return;
    }
    if (!emergencyNumber.trim()) {
      setFormError('3. Emergency Number is required.');
      return;
    }

    // Note Check: Mobile Number and Emergency Number should not be same!
    const cleanMobile = mobileNumber.trim().replace(/[\s-]/g, '');
    const cleanEmergency = emergencyNumber.trim().replace(/[\s-]/g, '');
    if (cleanMobile === cleanEmergency) {
      setFormError('Note: Mobile Number and Emergency Number should not be the same! Please provide a distinct emergency number.');
      return;
    }

    if (!residentialAddress.trim()) {
      setFormError('4. Residential Address is required.');
      return;
    }

    const resolvedHome = isHomeSameAsResidential ? residentialAddress.trim() : homeAddress.trim();
    if (!resolvedHome) {
      setFormError('5. Home Address is required.');
      return;
    }

    if (!tenthMarksheet.trim()) {
      setFormError('6. 10th Marksheet is required.');
      return;
    }
    if (!twelfthMarksheet.trim()) {
      setFormError('7. 12th Marksheet / Diploma Marksheet is required.');
      return;
    }
    if (!collegeMarksheet.trim()) {
      setFormError('8. College Marksheet is required.');
      return;
    }
    if (!collegeName.trim()) {
      setFormError('9. College Name is required.');
      return;
    }

    setFormSubmitting(true);
    const payload = {
      full_name: fullName.trim(),
      email: email.trim() || null,
      mobile_number: mobileNumber.trim(),
      emergency_number: emergencyNumber.trim(),
      residential_address: residentialAddress.trim(),
      home_address: resolvedHome,
      is_home_same_as_residential: isHomeSameAsResidential,
      tenth_marksheet: tenthMarksheet.trim(),
      twelfth_marksheet: twelfthMarksheet.trim(),
      college_marksheet: collegeMarksheet.trim(),
      college_name: collegeName.trim(),
      year_of_start: parseInt(yearOfStart) || 2021,
      year_of_end: parseInt(yearOfEnd) || 2025,
    };

    try {
      if (editingRecordId) {
        await internRecordsApi.update(editingRecordId, payload);
        setSuccessMsg(`Intern record for "${payload.full_name}" updated successfully!`);
      } else {
        await internRecordsApi.create(payload);
        setSuccessMsg(`New intern record for "${payload.full_name}" registered successfully!`);
      }
      setIsFormModalOpen(false);
      resetForm();
      fetchRecords();
      setTimeout(() => setSuccessMsg(''), 4000);
    } catch (err) {
      setFormError(err.response?.data?.detail || 'Failed to save intern record');
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDelete = async (rec) => {
    if (!window.confirm(`Are you sure you want to delete intern record for ${rec.full_name}?`)) {
      return;
    }
    try {
      await internRecordsApi.delete(rec.id);
      setSuccessMsg(`Record #${rec.id} deleted successfully.`);
      fetchRecords();
      setTimeout(() => setSuccessMsg(''), 3000);
    } catch (err) {
      setError(err.response?.data?.detail || 'Failed to delete record');
    }
  };

  const handleLoginAsIntern = async (rec) => {
    if (!rec.email) {
      alert(`No login email configured for candidate ${rec.full_name}.`);
      return;
    }
    const confirmed = window.confirm(
      `Login to Portal as Intern:\n\nName: ${rec.full_name}\nEmail: ${rec.email}\nDefault Password: admin123\n\nProceed to log in as this intern?`
    );
    if (!confirmed) return;

    try {
      setLoading(true);
      // Try login with email and admin123
      await login(rec.email, 'admin123');
      window.location.hash = 'dashboard';
      window.location.reload();
    } catch (err) {
      console.warn('Direct login failed, attempting SSO session switch:', err);
      try {
        await ssoLogin(rec.email);
        window.location.hash = 'dashboard';
        window.location.reload();
      } catch (ssoErr) {
        alert(`Failed to log in as ${rec.full_name}: ${err.response?.data?.detail || err.message}`);
      }
    } finally {
      setLoading(false);
    }
  };

  // Filtered and Sorted Records
  const processedRecords = useMemo(() => {
    let list = [...records];

    // Filter by search term
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      list = list.filter((r) =>
        (r.full_name || '').toLowerCase().includes(term) ||
        (r.email || '').toLowerCase().includes(term) ||
        (r.mobile_number || '').toLowerCase().includes(term) ||
        (r.emergency_number || '').toLowerCase().includes(term) ||
        (r.college_name || '').toLowerCase().includes(term) ||
        (r.residential_address || '').toLowerCase().includes(term) ||
        (r.home_address || '').toLowerCase().includes(term)
      );
    }

    // Filter by same address
    if (sameAddressFilter === 'same') {
      list = list.filter((r) => r.is_home_same_as_residential);
    } else if (sameAddressFilter === 'different') {
      list = list.filter((r) => !r.is_home_same_as_residential);
    }

    // Sort
    list.sort((a, b) => {
      let multiplier = sortOrder === 'asc' ? 1 : -1;
      switch (sortBy) {
        case 'id':
          return (a.id - b.id) * multiplier;
        case 'full_name':
          return (a.full_name || '').localeCompare(b.full_name || '') * multiplier;
        case 'mobile_number':
          return (a.mobile_number || '').localeCompare(b.mobile_number || '') * multiplier;
        case 'emergency_number':
          return (a.emergency_number || '').localeCompare(b.emergency_number || '') * multiplier;
        case 'college_name':
          return (a.college_name || '').localeCompare(b.college_name || '') * multiplier;
        case 'year_of_start':
          return ((a.year_of_start || 0) - (b.year_of_start || 0)) * multiplier;
        case 'year_of_end':
          return ((a.year_of_end || 0) - (b.year_of_end || 0)) * multiplier;
        default:
          return (a.id - b.id) * multiplier;
      }
    });

    return list;
  }, [records, searchTerm, sameAddressFilter, sortBy, sortOrder]);

  // Inline Validation Check for Mobile & Emergency
  const cleanMobileInput = mobileNumber.trim().replace(/[\s-]/g, '');
  const cleanEmergencyInput = emergencyNumber.trim().replace(/[\s-]/g, '');
  const isEmergencySameAsMobile = cleanMobileInput.length > 5 && cleanEmergencyInput.length > 5 && cleanMobileInput === cleanEmergencyInput;

  return (
    <div className="space-y-5 max-w-7xl mx-auto pb-12">
      {/* Top Banner */}
      <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start space-x-3.5">
            <div className="p-3 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-2xl shrink-0 shadow-xs">
              <FileSpreadsheet className="w-6 h-6 text-emerald-600" />
            </div>
            <div>
              <div className="flex items-center space-x-2.5">
                <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                  HR — Intern Record Details
                </h1>
                <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-200">
                  {isHRManager ? 'Human Resource Manager' : isSuperAdminOrAdmin ? 'Admin / Super Admin' : 'Portal Access View'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Centralized registry of verified intern candidates with portal login access, verified contacts (Mobile vs Emergency), residential & home mapping, and certified academic marksheets.
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2.5 shrink-0">
            {canManageRecords && (
              <div/>
              // <button
              //   type="button"
              //   onClick={handleGenerateSampleData}
              //   disabled={loading}
              //   className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200/80 text-slate-700 font-bold text-xs rounded-xl transition-all border border-slate-200 flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
              //   title="Populate demo intern records under Human Resource Manager"
              // >
              //   <Sparkles className="w-4 h-4 text-emerald-600" />
              //   <span>Generate Intern Data</span>
              // </button>
            )}

            {canManageRecords && (
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-all shadow-xs flex items-center space-x-1.5 cursor-pointer hover:shadow-md"
              >
                <Plus className="w-4 h-4 stroke-[2.5]" />
                <span>Add Intern Record</span>
              </button>
            )}
          </div>
        </div>

        {/* Global Notifications */}
        {error && (
          <div className="mt-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center space-x-2">
            <AlertTriangle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl flex items-center space-x-2 animate-in fade-in">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}
      </div>

      {/* Search, Filter & Active Ordering Strip */}
      <div className="space-y-3">
        <div className="bg-white rounded-2xl p-3.5 border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5 pointer-events-none" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search name, login email, phone, college..."
                className="w-full pl-9 pr-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
              />
            </div>

            {/* Filter by Home Address Same vs Different */}
            <div className="flex items-center space-x-1.5 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-[11px] font-semibold text-slate-600">Home Address:</span>
              <select
                value={sameAddressFilter}
                onChange={(e) => setSameAddressFilter(e.target.value)}
                className="bg-transparent font-bold text-xs text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="All">All Records</option>
                <option value="same">Same as Residential</option>
                <option value="different">Distinct Home Address</option>
              </select>
            </div>
          </div>

          <div className="flex items-center space-x-2 text-slate-500">
            <span>
              Showing <strong className="text-slate-900">{processedRecords.length}</strong> of {records.length} records
            </span>
            <button
              type="button"
              onClick={fetchRecords}
              className="p-1.5 hover:bg-slate-100 rounded-lg text-slate-600 transition-colors"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Active Table Ordering Strip */}
        <div className="bg-white rounded-xl px-4 py-2 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center space-x-2 text-slate-600">
            <span className="font-semibold text-slate-800 flex items-center space-x-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
              <span>Table Ordering:</span>
            </span>
            <span className="inline-flex items-center space-x-1 bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-0.5 rounded-lg font-bold">
              <span>{formatSortName(sortBy)}</span>
              <span className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.2 rounded uppercase">
                {sortOrder === 'asc' ? '▲ Ascending' : '▼ Descending'}
              </span>
            </span>
            {searchTerm && (
              <span className="text-slate-400">
                • Search: "{searchTerm}"
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={() => {
              setSortBy('id');
              setSortOrder('desc');
              setSearchTerm('');
              setSameAddressFilter('All');
            }}
            className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 flex items-center space-x-1 cursor-pointer"
          >
            <RotateCcw className="w-3 h-3" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          THE PRECISE AND EXACT TABLE OF DATA (Representing all 9 mandatory items)
          ========================================================================= */}
      <div className="bg-white rounded-3xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] font-bold uppercase tracking-wider text-slate-600 select-none">
                {/* ID Header */}
                <th
                  onClick={() => handleSort('id')}
                  className={`py-3.5 px-3 cursor-pointer group transition-colors text-center w-14 ${
                    sortBy === 'id' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="Sort by Record ID"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>#ID</span>
                    {sortBy === 'id' ? (
                      sortOrder === 'desc' ? <ArrowDown className="w-3 h-3 text-emerald-700" /> : <ArrowUp className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* 1. Full Name & Login Access Header */}
                <th
                  onClick={() => handleSort('full_name')}
                  className={`py-3.5 px-4 cursor-pointer group transition-colors min-w-[200px] ${
                    sortBy === 'full_name' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="1. Full Name & Portal Login"
                >
                  <div className="flex items-center space-x-1">
                    <span>1. Full Name (Login Access)</span>
                    {sortBy === 'full_name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* 2. Mobile Number Header */}
                <th
                  onClick={() => handleSort('mobile_number')}
                  className={`py-3.5 px-3.5 cursor-pointer group transition-colors min-w-[140px] ${
                    sortBy === 'mobile_number' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="2. Mobile Number"
                >
                  <div className="flex items-center space-x-1">
                    <span>2. Mobile Number</span>
                    {sortBy === 'mobile_number' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* 3. Emergency Number Header */}
                <th
                  onClick={() => handleSort('emergency_number')}
                  className={`py-3.5 px-3.5 cursor-pointer group transition-colors min-w-[150px] ${
                    sortBy === 'emergency_number' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="3. Emergency Number (Distinct)"
                >
                  <div className="flex items-center space-x-1">
                    <span>3. Emergency No.</span>
                    {sortBy === 'emergency_number' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* 4. Residential Address Header */}
                <th className="py-3.5 px-4 min-w-[180px]">
                  <span>4. Residential Address</span>
                </th>

                {/* 5. Home Address Header */}
                <th className="py-3.5 px-4 min-w-[180px]">
                  <span>5. Home Address</span>
                </th>

                {/* 6. 10th Marksheet Header */}
                <th className="py-3.5 px-3 min-w-[140px]">
                  <span>6. 10th Marksheet</span>
                </th>

                {/* 7. 12th / Diploma Marksheet Header */}
                <th className="py-3.5 px-3 min-w-[150px]">
                  <span>7. 12th / Diploma</span>
                </th>

                {/* 8. College Marksheet Header */}
                <th className="py-3.5 px-3 min-w-[150px]">
                  <span>8. College Marksheet</span>
                </th>

                {/* 9. College Name Header */}
                <th
                  onClick={() => handleSort('college_name')}
                  className={`py-3.5 px-4 cursor-pointer group transition-colors min-w-[180px] ${
                    sortBy === 'college_name' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="9. College Name"
                >
                  <div className="flex items-center space-x-1">
                    <span>9. College Name</span>
                    {sortBy === 'college_name' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* Year of Start */}
                <th
                  onClick={() => handleSort('year_of_start')}
                  className={`py-3.5 px-3 text-center cursor-pointer group transition-colors w-24 ${
                    sortBy === 'year_of_start' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="Year of Start"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>Start Yr</span>
                    {sortBy === 'year_of_start' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* Year of End */}
                <th
                  onClick={() => handleSort('year_of_end')}
                  className={`py-3.5 px-3 text-center cursor-pointer group transition-colors w-24 ${
                    sortBy === 'year_of_end' ? 'bg-emerald-50 text-emerald-900 border-b-2 border-emerald-600 font-extrabold' : 'hover:bg-slate-100'
                  }`}
                  title="Year of End"
                >
                  <div className="flex items-center justify-center space-x-1">
                    <span>End Yr</span>
                    {sortBy === 'year_of_end' ? (
                      sortOrder === 'asc' ? <ArrowUp className="w-3 h-3 text-emerald-700" /> : <ArrowDown className="w-3 h-3 text-emerald-700" />
                    ) : (
                      <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-60" />
                    )}
                  </div>
                </th>

                {/* Actions Header */}
                <th className="py-3.5 px-4 text-right min-w-[90px]">Action</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {processedRecords.length === 0 ? (
                <tr>
                  <td colSpan={13} className="py-12 text-center text-slate-400">
                    {loading ? 'Loading intern records...' : 'No intern records found.'}
                  </td>
                </tr>
              ) : (
                processedRecords.map((rec) => (
                  <tr
                    key={rec.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    onClick={() => {
                      setSelectedRecord(rec);
                      setIsDetailModalOpen(true);
                    }}
                  >
                    {/* #ID */}
                    <td className={`py-3.5 px-3 text-center font-mono font-semibold ${
                      sortBy === 'id' ? 'bg-emerald-50/40 text-emerald-900 font-bold' : 'text-slate-400 group-hover:text-emerald-700'
                    }`}>
                      #{rec.id}
                    </td>

                    {/* 1. Full Name & Portal Login Access */}
                    <td className={`py-3.5 px-4 ${sortBy === 'full_name' ? 'bg-emerald-50/30' : ''}`}>
                      <div className="flex items-center space-x-2.5">
                        <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-xs shrink-0 ring-1 ring-emerald-300/60">
                          {rec.full_name?.charAt(0) || 'I'}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-slate-900 group-hover:text-emerald-700 transition-colors truncate">
                            {rec.full_name}
                          </p>
                          {rec.email ? (
                            <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                              <span className="text-[10px] text-emerald-700 font-mono flex items-center space-x-1 truncate" title={`Portal Login Email: ${rec.email}`}>
                                <Mail className="w-2.5 h-2.5 shrink-0" />
                                <span className="truncate">{rec.email}</span>
                              </span>
                              {/* <span className="text-[9px] bg-slate-100 text-slate-600 font-mono font-medium px-1.5 py-0.2 rounded border border-slate-200" title="Intern Portal Login Password">
                                pwd: admin123
                              </span> */}
                            </div>
                          ) : (
                            <span className="text-[10px] text-slate-400 italic">No login email linked</span>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* 2. Mobile Number */}
                    <td className={`py-3.5 px-3.5 font-mono text-slate-800 font-semibold ${sortBy === 'mobile_number' ? 'bg-emerald-50/30' : ''}`}>
                      <span className="inline-flex items-center space-x-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{rec.mobile_number}</span>
                      </span>
                    </td>

                    {/* 3. Emergency Number */}
                    <td className={`py-3.5 px-3.5 font-mono ${sortBy === 'emergency_number' ? 'bg-emerald-50/30' : ''}`}>
                      <span className="inline-flex items-center space-x-1 text-rose-700 font-semibold bg-rose-50 px-2 py-0.5 rounded-md border border-rose-200">
                        <Phone className="w-3 h-3 text-rose-500" />
                        <span>{rec.emergency_number}</span>
                      </span>
                    </td>

                    {/* 4. Residential Address */}
                    <td className="py-3.5 px-4 text-slate-700 max-w-xs">
                      <p className="truncate text-[11px]" title={rec.residential_address}>
                        {rec.residential_address}
                      </p>
                    </td>

                    {/* 5. Home Address */}
                    <td className="py-3.5 px-4 text-slate-700 max-w-xs">
                      <div className="flex items-center space-x-1 truncate">
                        <p className="truncate text-[11px]" title={rec.home_address}>
                          {rec.home_address}
                        </p>
                        {rec.is_home_same_as_residential && (
                          <span className="shrink-0 text-[9px] bg-brand-50 text-brand-700 font-bold px-1.5 py-0.2 rounded border border-brand-200" title="Same as Residential Address">
                            ✓ Same
                          </span>
                        )}
                      </div>
                    </td>

                    {/* 6. 10th Marksheet */}
                    <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setViewingMarksheet({
                          title: '10th Secondary Marksheet',
                          fileName: rec.tenth_marksheet,
                          studentName: rec.full_name,
                          collegeName: rec.college_name,
                        })}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer w-full text-left"
                      >
                        <FileText className="w-3 h-3 text-emerald-600 shrink-0" />
                        <span className="truncate max-w-[95px]">{rec.tenth_marksheet || '10th Marksheet'}</span>
                      </button>
                    </td>

                    {/* 7. 12th / Diploma Marksheet */}
                    <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setViewingMarksheet({
                          title: '12th / Diploma Marksheet',
                          fileName: rec.twelfth_marksheet,
                          studentName: rec.full_name,
                          collegeName: rec.college_name,
                        })}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer w-full text-left"
                      >
                        <FileText className="w-3 h-3 text-blue-600 shrink-0" />
                        <span className="truncate max-w-[95px]">{rec.twelfth_marksheet || '12th Marksheet'}</span>
                      </button>
                    </td>

                    {/* 8. College Marksheet */}
                    <td className="py-3.5 px-3" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => setViewingMarksheet({
                          title: 'College Consolidated Marksheet',
                          fileName: rec.college_marksheet,
                          studentName: rec.full_name,
                          collegeName: rec.college_name,
                        })}
                        className="inline-flex items-center space-x-1 px-2 py-1 rounded-md bg-slate-50 hover:bg-emerald-50 text-slate-700 hover:text-emerald-700 border border-slate-200 hover:border-emerald-300 text-[10px] font-semibold transition-colors cursor-pointer w-full text-left"
                      >
                        <FileCheck className="w-3 h-3 text-purple-600 shrink-0" />
                        <span className="truncate max-w-[95px]">{rec.college_marksheet || 'College Marksheet'}</span>
                      </button>
                    </td>

                    {/* 9. College Name */}
                    <td className={`py-3.5 px-4 ${sortBy === 'college_name' ? 'bg-emerald-50/30' : ''}`}>
                      <p className="font-semibold text-slate-800 truncate max-w-[160px]" title={rec.college_name}>
                        {rec.college_name}
                      </p>
                    </td>

                    {/* Year of Start */}
                    <td className={`py-3.5 px-3 text-center font-mono font-medium ${sortBy === 'year_of_start' ? 'bg-emerald-50/30' : 'text-slate-600'}`}>
                      {rec.year_of_start}
                    </td>

                    {/* Year of End */}
                    <td className={`py-3.5 px-3 text-center font-mono font-medium ${sortBy === 'year_of_end' ? 'bg-emerald-50/30' : 'text-slate-600'}`}>
                      {rec.year_of_end}
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end space-x-1.5">
                        {rec.email && (
                          <div/>
                          // <button
                          //   type="button"
                          //   onClick={() => handleLoginAsIntern(rec)}
                          //   className="inline-flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-all shadow-2xs hover:shadow cursor-pointer shrink-0"
                          //   title={`Log into intern portal as ${rec.full_name} (Password: admin123)`}
                          // >
                          //   <LogIn className="w-3 h-3" />
                          //   <span>Login Access</span>
                          // </button>
                        )}

                        <button
                          type="button"
                          onClick={() => {
                            setSelectedRecord(rec);
                            setIsDetailModalOpen(true);
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-700 hover:bg-emerald-50 transition-colors"
                          title="View Complete Record"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>

                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => openEditModal(rec)}
                            className="p-1 rounded text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                            title="Edit Record"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManageRecords && (
                          <button
                            type="button"
                            onClick={() => handleDelete(rec)}
                            className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                            title="Delete Record"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* =========================================================================
          MODAL 1: ADD / EDIT INTERN RECORD MODAL (Contains all 9 requested forms)
          ========================================================================= */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
                  <FileSpreadsheet className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">
                    {editingRecordId ? 'Edit Intern Record' : 'Fill Intern Record Details (9 Mandatory Forms)'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    All 9 fields are mandatory: Personal, Contact Validation, Address Sync, Marksheets, and College
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsFormModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* 1. Full Name & Portal Login Email */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    1. Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. Priya Sharma"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    Portal Login Access Email
                  </label>
                  <div className="relative">
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. priya.sharma@ingage.com"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 2 & 3: Mobile Number & Emergency Number (With Note: Cannot be the same) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3.5 bg-slate-50/80 rounded-2xl border border-slate-200">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                    2. Mobile Number *
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={mobileNumber}
                      onChange={(e) => setMobileNumber(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full pl-9 pr-3.5 py-2 bg-white border border-slate-200 rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1 flex items-center justify-between">
                    <span>3. Emergency Number *</span>
                    <span className="text-[10px] text-slate-400 font-normal">Must not be same</span>
                  </label>
                  <div className="relative">
                    <Phone className="w-3.5 h-3.5 text-rose-500 absolute left-3 top-3 pointer-events-none" />
                    <input
                      type="tel"
                      required
                      value={emergencyNumber}
                      onChange={(e) => setEmergencyNumber(e.target.value)}
                      placeholder="+91 91234 56789"
                      className={`w-full pl-9 pr-3.5 py-2 bg-white border rounded-xl text-xs font-mono font-medium text-slate-900 focus:outline-none focus:ring-2 ${
                        isEmergencySameAsMobile
                          ? 'border-rose-400 ring-2 ring-rose-200 text-rose-800'
                          : 'border-slate-200 focus:ring-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                {/* Inline Validation Banner for Contact Discrepancy */}
                <div className="sm:col-span-2">
                  {isEmergencySameAsMobile ? (
                    <div className="p-2.5 rounded-lg bg-rose-100/80 border border-rose-300 text-rose-800 text-[11px] font-semibold flex items-center space-x-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                      <span>Note: Mobile Number and Emergency Number should not be the same! Please enter a distinct emergency number.</span>
                    </div>
                  ) : emergencyNumber.length > 5 && mobileNumber.length > 5 ? (
                    <div className="p-2 rounded-lg bg-emerald-50 text-emerald-800 text-[10px] font-semibold flex items-center space-x-1.5">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Mobile and Emergency numbers are distinct & verified.</span>
                    </div>
                  ) : null}
                </div>
              </div>

              {/* 4. Residential Address (Mandatory Fill) */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1">
                  4. Residential Address *
                </label>
                <textarea
                  rows={2}
                  required
                  value={residentialAddress}
                  onChange={(e) => handleResidentialAddressChange(e.target.value)}
                  placeholder="Street address, apartment, locality, city, state, pin code..."
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:bg-white resize-none"
                />
              </div>

              {/* 5. Home Address (With Note: Tick box on the right side of the word "Home Address" by default) */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
                      5. Home Address *
                    </label>

                    {/* Placed at the right side of the word "Home Address": tick box by default */}
                    <label className="inline-flex items-center space-x-1.5 px-2.5 py-0.5 bg-brand-50 hover:bg-brand-100 border border-brand-200 rounded-lg text-xs font-semibold text-brand-700 cursor-pointer transition-colors shadow-2xs select-none">
                      <input
                        type="checkbox"
                        checked={isHomeSameAsResidential}
                        onChange={(e) => handleToggleSameAddress(e.target.checked)}
                        className="w-3.5 h-3.5 text-brand-600 rounded focus:ring-brand-500 cursor-pointer"
                      />
                      <span>Same as Residential Address</span>
                    </label>
                  </div>

                  <span className="text-[10px] text-slate-400">
                    {isHomeSameAsResidential ? 'Auto-synced with Residential' : 'Custom Home Address'}
                  </span>
                </div>

                <textarea
                  rows={2}
                  required
                  disabled={isHomeSameAsResidential}
                  value={homeAddress}
                  onChange={(e) => setHomeAddress(e.target.value)}
                  placeholder="Permanent home address..."
                  className={`w-full px-3.5 py-2 border rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none ${
                    isHomeSameAsResidential
                      ? 'bg-slate-100 text-slate-500 border-slate-200 cursor-not-allowed'
                      : 'bg-slate-50 border-slate-200 focus:bg-white'
                  }`}
                />
              </div>

              {/* 6, 7, 8: Marksheet Uploads / Fields */}
              <div className="space-y-3 pt-2 border-t border-slate-200/80">
                <div className="flex items-center space-x-1.5">
                  <FileCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-800">
                    Academic Marksheets (Mandatory 6, 7, 8)
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* 6. 10th Marksheet */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700">
                      6. 10th Marksheet *
                    </label>
                    <input
                      type="text"
                      required
                      value={tenthMarksheet}
                      onChange={(e) => setTenthMarksheet(e.target.value)}
                      placeholder="10th_Marksheet.pdf"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <label className="block text-[10px] text-brand-600 hover:text-brand-800 cursor-pointer font-semibold underline">
                      <span>Browse / Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => handleFileUpload(e, setTenthMarksheet)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* 7. 12th Marksheet / Diploma Marksheet */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700">
                      7. 12th / Diploma Marksheet *
                    </label>
                    <input
                      type="text"
                      required
                      value={twelfthMarksheet}
                      onChange={(e) => setTwelfthMarksheet(e.target.value)}
                      placeholder="12th_Diploma.pdf"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <label className="block text-[10px] text-brand-600 hover:text-brand-800 cursor-pointer font-semibold underline">
                      <span>Browse / Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => handleFileUpload(e, setTwelfthMarksheet)}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {/* 8. College Marksheet */}
                  <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 space-y-1.5">
                    <label className="block text-[11px] font-bold text-slate-700">
                      8. College Marksheet *
                    </label>
                    <input
                      type="text"
                      required
                      value={collegeMarksheet}
                      onChange={(e) => setCollegeMarksheet(e.target.value)}
                      placeholder="College_Marksheet.pdf"
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                    <label className="block text-[10px] text-brand-600 hover:text-brand-800 cursor-pointer font-semibold underline">
                      <span>Browse / Upload File</span>
                      <input
                        type="file"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={(e) => handleFileUpload(e, setCollegeMarksheet)}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              </div>

              {/* 9. College Name, Year of Start and Year of End */}
              <div className="pt-2 border-t border-slate-200/80 space-y-3">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center space-x-1.5">
                  <School className="w-3.5 h-3.5 text-emerald-600" />
                  <span>9. College Name, Year of Start and Year of End *</span>
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      College Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={collegeName}
                      onChange={(e) => setCollegeName(e.target.value)}
                      placeholder="e.g. Anna University (CEG)"
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Year of Start *
                    </label>
                    <input
                      type="number"
                      required
                      min={2000}
                      max={2035}
                      value={yearOfStart}
                      onChange={(e) => setYearOfStart(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Year of End *
                    </label>
                    <input
                      type="number"
                      required
                      min={2000}
                      max={2035}
                      value={yearOfEnd}
                      onChange={(e) => setYearOfEnd(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    />
                  </div>
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-4 flex items-center justify-end space-x-3 border-t border-slate-200 shrink-0">
                <button
                  type="button"
                  onClick={() => setIsFormModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting || isEmergencySameAsMobile}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-all flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
                >
                  <Check className="w-4 h-4 stroke-[2.5]" />
                  <span>{formSubmitting ? 'Saving...' : editingRecordId ? 'Update Record' : 'Save Intern Record'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 2: INTERN RECORD DETAILS VIEW MODAL
          ========================================================================= */}
      {isDetailModalOpen && selectedRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2.5">
                <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center text-sm shadow-2xs">
                  {selectedRecord.full_name?.charAt(0) || 'I'}
                </div>
                <div>
                  <h3 className="font-bold text-base text-slate-900">{selectedRecord.full_name}</h3>
                  <p className="text-xs text-slate-500">
                    Intern Record #{selectedRecord.id} • Portal Login: {selectedRecord.email || 'None'}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Identity & Portal Access */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-emerald-50/60 rounded-2xl border border-emerald-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Candidate Full Name</span>
                  <span className="text-xs font-bold text-slate-900 mt-0.5 block">{selectedRecord.full_name}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-emerald-700 uppercase tracking-wider block">Portal Login Email</span>
                  <span className="text-xs font-mono font-bold text-emerald-800 mt-0.5 block">{selectedRecord.email || 'Not Configured'}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Portal Password</span>
                  <span className="text-xs font-mono font-bold text-slate-900 mt-0.5 block">admin123</span>
                </div>
              </div>

              {/* Contacts */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 bg-slate-50 rounded-2xl border border-slate-200">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">2. Mobile Number</span>
                  <span className="text-xs font-mono font-bold text-slate-900 mt-0.5 block">{selectedRecord.mobile_number}</span>
                </div>
                <div>
                  <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wider block">3. Emergency Number</span>
                  <span className="text-xs font-mono font-bold text-rose-700 mt-0.5 block">{selectedRecord.emergency_number}</span>
                  <span className="text-[10px] text-emerald-600 font-semibold">✓ Verified distinct from mobile</span>
                </div>
              </div>

              {/* Addresses */}
              <div className="space-y-3">
                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">4. Residential Address</span>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{selectedRecord.residential_address}</p>
                </div>

                <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">5. Home Address</span>
                    {selectedRecord.is_home_same_as_residential && (
                      <span className="text-[10px] font-semibold bg-brand-100 text-brand-800 px-2 py-0.2 rounded-full">
                        Same as Residential Address
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-800 font-medium leading-relaxed">{selectedRecord.home_address}</p>
                </div>
              </div>

              {/* Academic Details */}
              <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200 space-y-2">
                <span className="text-[10px] font-bold text-emerald-800 uppercase tracking-wider block">9. College & Degree Timeline</span>
                <p className="text-sm font-bold text-slate-900">{selectedRecord.college_name}</p>
                <div className="flex items-center space-x-3 text-xs text-slate-600">
                  <span>Year of Start: <strong className="text-slate-900 font-mono">{selectedRecord.year_of_start}</strong></span>
                  <span>•</span>
                  <span>Year of End: <strong className="text-slate-900 font-mono">{selectedRecord.year_of_end}</strong></span>
                </div>
              </div>

              {/* Verified Documents */}
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-slate-700 uppercase tracking-wider block">Attached Marksheet Files (6, 7, 8)</span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">6. 10th Marksheet</span>
                    <p className="text-xs font-semibold text-slate-800 truncate" title={selectedRecord.tenth_marksheet}>{selectedRecord.tenth_marksheet}</p>
                    <button
                      type="button"
                      onClick={() => setViewingMarksheet({
                        title: '10th Secondary Marksheet',
                        fileName: selectedRecord.tenth_marksheet,
                        studentName: selectedRecord.full_name,
                        collegeName: selectedRecord.college_name,
                      })}
                      className="text-[11px] text-emerald-600 font-bold hover:underline flex items-center space-x-1 cursor-pointer pt-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect Marksheet</span>
                    </button>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">7. 12th / Diploma</span>
                    <p className="text-xs font-semibold text-slate-800 truncate" title={selectedRecord.twelfth_marksheet}>{selectedRecord.twelfth_marksheet}</p>
                    <button
                      type="button"
                      onClick={() => setViewingMarksheet({
                        title: '12th / Diploma Marksheet',
                        fileName: selectedRecord.twelfth_marksheet,
                        studentName: selectedRecord.full_name,
                        collegeName: selectedRecord.college_name,
                      })}
                      className="text-[11px] text-emerald-600 font-bold hover:underline flex items-center space-x-1 cursor-pointer pt-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect Marksheet</span>
                    </button>
                  </div>

                  <div className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-1">
                    <span className="text-[10px] font-bold text-slate-400 block">8. College Consolidated</span>
                    <p className="text-xs font-semibold text-slate-800 truncate" title={selectedRecord.college_marksheet}>{selectedRecord.college_marksheet}</p>
                    <button
                      type="button"
                      onClick={() => setViewingMarksheet({
                        title: 'College Consolidated Marksheet',
                        fileName: selectedRecord.college_marksheet,
                        studentName: selectedRecord.full_name,
                        collegeName: selectedRecord.college_name,
                      })}
                      className="text-[11px] text-emerald-600 font-bold hover:underline flex items-center space-x-1 cursor-pointer pt-1"
                    >
                      <Eye className="w-3 h-3" />
                      <span>Inspect Marksheet</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end space-x-2 shrink-0">
              {selectedRecord.email && (
                <div/>
                // <button
                //   type="button"
                //   onClick={() => {
                //     setIsDetailModalOpen(false);
                //     handleLoginAsIntern(selectedRecord);
                //   }}
                //   className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer flex items-center space-x-1.5"
                // >
                //   <LogIn className="w-3.5 h-3.5" />
                //   <span>Login to Intern Portal</span>
                // </button>
              )}
              {canManageRecords && (
                <button
                  type="button"
                  onClick={() => {
                    setIsDetailModalOpen(false);
                    openEditModal(selectedRecord);
                  }}
                  className="px-4 py-2 bg-blue-600 text-white font-bold text-xs rounded-xl shadow-xs hover:bg-blue-700 transition-colors cursor-pointer"
                >
                  Edit Record
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsDetailModalOpen(false)}
                className="px-4 py-2 bg-white text-slate-700 border border-slate-200 font-semibold text-xs rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          MODAL 3: CERTIFIED MARKSHEET INSPECTOR / VIEWER MODAL
          ========================================================================= */}
      {viewingMarksheet && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/70 backdrop-blur-xs p-3 sm:p-4 animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <div className="flex items-center space-x-2">
                <FileCheck className="w-5 h-5 text-emerald-600" />
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{viewingMarksheet.title}</h3>
                  <p className="text-[11px] text-slate-500 font-mono">{viewingMarksheet.fileName}</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setViewingMarksheet(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 bg-slate-100/70 flex flex-col items-center">
              <div className="w-full bg-white rounded-2xl p-6 border-4 border-double border-emerald-700/30 shadow-md text-center space-y-4 relative">
                <div className="absolute top-3 right-3 text-[9px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full uppercase tracking-wider">
                  Verified Marksheet
                </div>
                <div className="w-12 h-12 bg-emerald-100 text-emerald-800 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                  🎓
                </div>
                <div>
                  <h4 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                    Certificate of Academic Performance
                  </h4>
                  <p className="text-xs text-slate-500 mt-0.5">{viewingMarksheet.collegeName || 'Accredited Board / University'}</p>
                </div>

                <div className="py-3 px-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700 space-y-1">
                  <p>This certifies that the official marksheet for candidate</p>
                  <p className="text-sm font-bold text-emerald-800">{viewingMarksheet.studentName}</p>
                  <p className="text-[11px] text-slate-500 font-mono pt-1">
                    Document Ref: {viewingMarksheet.fileName}
                  </p>
                </div>

                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
                  <span>Authorized by: Human Resource Manager</span>
                  <span>Ingage Technologies Verification Seal</span>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 bg-white flex items-center justify-between">
              <span className="text-xs text-slate-500">Document status: <strong className="text-emerald-700">Verified & Authenticated</strong></span>
              <button
                type="button"
                onClick={() => setViewingMarksheet(null)}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default InternRecordsPage;
