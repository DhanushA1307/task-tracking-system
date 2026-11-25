import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import BrandLogo from '../components/BrandLogo';
import { Mail, Lock, ArrowRight, Eye, EyeOff, AlertCircle, Building2 } from 'lucide-react';

export const LoginPage = ({ onLoginSuccess }) => {
  const { login } = useAuth();
  
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberWorkspace, setRememberWorkspace] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const userData = await login(email, password);
      if (onLoginSuccess) onLoginSuccess(userData);
    } catch (err) {
      setError(err.response?.data?.detail || 'Invalid email or password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-slate-50 p-4 sm:p-6 lg:p-8">
      {/* Centered Box split into 2 sides */}
      <div className="w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col md:flex-row">
        
        {/* ================= SIDE 1: Logo Side ================= */}
        <div className="w-full md:w-1/2 p-8 sm:p-12 lg:p-14 bg-gradient-to-br from-[#f4faed] via-white to-[#e8f5dc] border-b md:border-b-0 md:border-r border-slate-200/80 flex flex-col items-center justify-center text-center relative overflow-hidden">
          {/* Subtle decorative background circles */}
          <div className="absolute -top-16 -left-16 w-48 h-48 rounded-full bg-brand-100/50 blur-2xl pointer-events-none" />
          <div className="absolute -bottom-16 -right-16 w-48 h-48 rounded-full bg-brand-200/40 blur-2xl pointer-events-none" />

          <div className="relative z-10 flex flex-col items-center justify-center my-auto py-2">
            {/* Center Logo */}
            <div className="p-1 rounded-2xl bg-white/90 shadow-xs border border-brand-100/80 mb-4 inline-flex items-center justify-center">
              <BrandLogo textSize="text-7xl sm:text-5xl" />
            </div>

            {/* <h1 className="text-xl sm:text-2xl font-extrabold text-slate-900 tracking-tight mt-1">
              Task Tracking System Ingage Technologies •
            </h1> */}
            <p className="text-xs sm:text-sm text-slate-500 mt-2 max-w-xs font-medium leading-relaxed">
               Internal Workspace Management
            </p>

            {/* <div className="mt-8 pt-6 border-t border-brand-200/60 flex items-center space-x-1.5 text-xs text-brand-800 font-semibold bg-brand-50/80 px-3 py-1.5 rounded-full border border-brand-200/70">
              <Building2 className="w-3.5 h-3.5 text-brand-600 shrink-0" />
              <span>Enterprise Hierarchy Portal</span>
            </div> */}
          </div>
        </div>

        {/* ================= SIDE 2: Email, Password & Remember Workspace Form ================= */}
        <div className="w-full md:w-1/2 p-8 sm:p-12 lg:p-14 flex flex-col justify-center bg-white">
          <div className="w-full max-w-sm mx-auto my-auto">
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                Welcome back
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 mt-1">
                Sign in to your account to continue
              </p>
            </div>

            {error && (
              <div className="mb-5 p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* 1. Email Address */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600 mb-1.5">
                  Email Address
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@ingage.com"
                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white focus:border-transparent transition-all"
                  />
                </div>
              </div>

              {/* 2. Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-600">
                    Password
                  </label>
                  <span className="text-[11px] text-brand-700 font-medium">Default: admin123</span>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-500 focus:bg-white focus:border-transparent transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(prev => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                    title={showPassword ? 'Hide password' : 'Show password'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* 3. Follows with "Remember my workspace" */}
              <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                <label className="flex items-center space-x-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={rememberWorkspace}
                    onChange={(e) => setRememberWorkspace(e.target.checked)}
                    className="rounded text-brand-600 focus:ring-brand-500 w-4 h-4 cursor-pointer accent-brand-600"
                  />
                  <span className="font-medium text-slate-700">Remember my workspace</span>
                </label>
                <span className="text-slate-400 text-[11px]">Secure Session</span>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full mt-2 py-3 px-4 bg-brand-600 hover:bg-brand-700 text-white font-semibold rounded-xl text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer disabled:opacity-50"
              >
                <span>{loading ? 'Signing In...' : 'Submit'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>

            {/* Quick Role Fill helper pills */}
            {/* <div className="mt-6 pt-5 border-t border-slate-100">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider mb-2 text-center">
                Quick Role Credentials
              </p>
              <div className="flex flex-wrap items-center justify-center gap-1.5">
                {[
                  { label: 'Intern', email: 'priya.sharma@ingage.com' },
                  { label: 'Team Lead', email: 'teamlead@ingage.com' },
                  { label: 'HR Manager', email: 'hr@ingage.com' },
                  { label: 'Admin', email: 'admin@ingage.com' },
                  { label: 'Super Admin', email: 'superadmin@ingage.com' }
                ].map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setEmail(item.email);
                      setPassword('admin123');
                    }}
                    className={`px-2.5 py-1 text-[11px] rounded-lg transition-colors font-medium cursor-pointer ${
                      email === item.email
                        ? 'bg-brand-100 text-brand-800 border border-brand-200'
                        : 'bg-slate-100 hover:bg-slate-200 text-slate-600'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div> */}

            {/* Footer note */}
            <div className="mt-6 text-center text-xs text-slate-400">
              <span>Ingage Technologies © {new Date().getFullYear()}</span>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
};

export default LoginPage;

