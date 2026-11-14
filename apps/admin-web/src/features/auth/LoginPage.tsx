import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';

export const LoginPage: React.FC = () => {
  const { login, isLoading } = useAuth();
  const { showToast } = useToast();
  const [username, setUsername] = useState('owner_sangli');
  const [password, setPassword] = useState('••••••••');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) {
      setError('Please enter a username or email');
      return;
    }
    setError(null);
    try {
      await login(username.trim());
      showToast(`Welcome back! Logged in as ${username}`, 'success');
    } catch (err: any) {
      setError(err.message || 'Login failed. Please verify credentials.');
      showToast(err.message || 'Login failed', 'error');
    }
  };

  const quickRoles = [
    { label: '👑 Dairy Owner', username: 'owner_sangli', desc: 'Full administrative access' },
    { label: '🏢 Center Manager', username: 'mgr1_840230', desc: 'Center operations & approvals' },
    { label: '📊 Accountant', username: 'acct_840230', desc: 'Billing, payouts & payroll' },
    { label: '⚖️ Collection Operator', username: 'operator_tasgaon', desc: 'Intake counter & POS' },
    { label: '🛡️ Supervisor', username: 'supervisor_p11', desc: 'Overrides & adjustments' },
  ];

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col justify-center py-12 sm:px-6 lg:px-8 text-slate-100 antialiased">
      <div className="sm:mx-auto sm:w-full sm:max-w-md text-center">
        <div className="inline-flex w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-500 to-teal-600 items-center justify-center text-white text-3xl font-black shadow-xl shadow-emerald-500/30 mb-4">
          D
        </div>
        <h2 className="text-3xl font-extrabold tracking-tight text-white">
          DFARM Admin Web
        </h2>
        <p className="mt-2 text-sm text-slate-400 font-medium">
          Smart Dairy Operations & Management Portal
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-slate-800/90 backdrop-blur-md py-8 px-6 shadow-2xl rounded-2xl sm:px-10 border border-slate-700">
          {error && (
            <div className="mb-6 p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center gap-2">
              <span>⚠</span>
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Staff Username or Email
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. owner_sangli"
                disabled={isLoading}
                required
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                Staff Passcode
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                disabled={isLoading}
                className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition"
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full mt-2 py-3 px-4 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-sm shadow-lg shadow-emerald-600/30 transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Signing In...</span>
                </>
              ) : (
                <span>Sign In to Admin Console</span>
              )}
            </button>
          </form>

          {/* Quick Staff Role Selection */}
          <div className="mt-8 pt-6 border-t border-slate-700/80">
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3 text-center">
              Quick Role Switch (Testing & QA)
            </p>
            <div className="space-y-2">
              {quickRoles.map((role) => (
                <button
                  key={role.username}
                  type="button"
                  onClick={() => {
                    setUsername(role.username);
                    setPassword('password123');
                  }}
                  className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition ${
                    username === role.username
                      ? 'bg-emerald-950/60 border-emerald-500/60 text-white'
                      : 'bg-slate-900/60 border-slate-700/60 text-slate-300 hover:bg-slate-900 hover:text-white'
                  }`}
                >
                  <div>
                    <span className="text-xs font-bold block">{role.label}</span>
                    <span className="text-[10px] text-slate-400 block">{role.desc}</span>
                  </div>
                  <span className="text-[10px] font-mono font-bold bg-slate-800 px-2 py-1 rounded text-slate-300">
                    {role.username}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
