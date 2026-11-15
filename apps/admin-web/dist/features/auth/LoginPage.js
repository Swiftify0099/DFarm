import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useState } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
export const LoginPage = () => {
    const { login, isLoading } = useAuth();
    const { showToast } = useToast();
    const [username, setUsername] = useState('owner_sangli');
    const [password, setPassword] = useState('••••••••');
    const [error, setError] = useState(null);
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!username.trim()) {
            setError('Please enter a username or email');
            return;
        }
        setError(null);
        try {
            await login(username.trim());
            showToast(`Welcome back! Logged in as ${username}`, 'success');
        }
        catch (err) {
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
    return (_jsxs("div", { className: "min-h-screen bg-[#F4F7FB] flex flex-col justify-center py-12 px-4 sm:px-6 lg:px-8 text-slate-800 antialiased relative overflow-hidden select-none", children: [_jsx("div", { className: "absolute top-12 left-1/4 w-80 h-80 rounded-full bg-emerald-200/30 blur-3xl pointer-events-none" }), _jsx("div", { className: "absolute bottom-12 right-1/4 w-96 h-96 rounded-full bg-teal-200/25 blur-3xl pointer-events-none" }), _jsxs("div", { className: "sm:mx-auto sm:w-full sm:max-w-md text-center relative z-10", children: [_jsx("div", { className: "inline-flex w-16 h-16 rounded-3xl bg-gradient-to-tr from-[#10B981] via-[#0D9488] to-[#00506E] items-center justify-center text-white text-3xl font-black border border-white/40 shadow-[0_12px_24px_rgba(16,185,129,0.35),inset_0_2px_3px_rgba(255,255,255,0.6),inset_0_-2px_4px_rgba(0,0,0,0.25)] mb-4 transform hover:scale-105 transition-transform duration-200", children: "D" }), _jsx("h2", { className: "text-3xl font-black tracking-tight text-slate-900", children: "DFARM Admin Web" }), _jsx("p", { className: "mt-1.5 text-xs sm:text-sm text-slate-500 font-bold uppercase tracking-wider", children: "Smart Dairy Operations & Management Portal" })] }), _jsx("div", { className: "mt-8 sm:mx-auto sm:w-full sm:max-w-md relative z-10", children: _jsxs("div", { className: "bg-white/95 backdrop-blur-md py-8 px-6 sm:px-10 rounded-3xl border border-white/90 shadow-[0_20px_50px_-10px_rgba(15,23,42,0.08),0_0_0_1px_rgba(255,255,255,0.9)_inset,inset_1px_1px_2px_rgba(255,255,255,1),inset_-1px_-1px_3px_rgba(0,0,0,0.02)]", children: [error && (_jsxs("div", { className: "mb-6 p-4 rounded-2xl bg-[#FFF6F6] border border-rose-200/80 text-rose-700 text-xs sm:text-sm font-semibold flex items-center gap-2.5 shadow-[inset_1px_1px_2px_rgba(255,255,255,0.9)]", children: [_jsx("span", { className: "text-base", children: "\u26A0" }), _jsx("span", { children: error })] })), _jsxs("form", { onSubmit: handleSubmit, className: "space-y-4 sm:space-y-5", children: [_jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5", children: "Staff Username or Email" }), _jsx("div", { className: "relative", children: _jsx("input", { type: "text", value: username, onChange: (e) => setUsername(e.target.value), placeholder: "e.g. owner_sangli", disabled: isLoading, required: true, className: "w-full px-4 py-2.5 rounded-xl bg-[#EDF2F7] border border-slate-200/90 text-slate-900 placeholder-slate-400 text-sm font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.85)] focus:bg-white focus:outline-none focus:border-[#00506E] focus:shadow-[inset_1px_1px_2px_rgba(0,80,110,0.1),0_0_0_3px_rgba(0,80,110,0.15)] transition" }) })] }), _jsxs("div", { children: [_jsx("label", { className: "block text-[11px] font-extrabold uppercase tracking-wider text-slate-500 mb-1.5", children: "Staff Passcode" }), _jsx("div", { className: "relative", children: _jsx("input", { type: "password", value: password, onChange: (e) => setPassword(e.target.value), placeholder: "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022", disabled: isLoading, className: "w-full px-4 py-2.5 rounded-xl bg-[#EDF2F7] border border-slate-200/90 text-slate-900 placeholder-slate-400 text-sm font-semibold shadow-[inset_2px_2px_4px_rgba(15,23,42,0.05),inset_-2px_-2px_4px_rgba(255,255,255,0.85)] focus:bg-white focus:outline-none focus:border-[#00506E] focus:shadow-[inset_1px_1px_2px_rgba(0,80,110,0.1),0_0_0_3px_rgba(0,80,110,0.15)] transition" }) })] }), _jsx("button", { type: "submit", disabled: isLoading, className: "w-full mt-2 py-3.5 px-4 rounded-xl bg-gradient-to-r from-[#00688F] to-[#00506E] hover:from-[#005A7C] hover:to-[#00425C] text-white font-black text-sm tracking-wide border border-white/30 shadow-[0_6px_16px_-2px_rgba(0,80,110,0.35),0_2px_4px_-1px_rgba(0,80,110,0.2),inset_0_2px_2px_rgba(255,255,255,0.35),inset_0_-2px_4px_rgba(0,0,0,0.2)] hover:shadow-[0_8px_20px_-2px_rgba(0,80,110,0.45)] hover:-translate-y-0.5 active:translate-y-0.5 active:shadow-[inset_0_3px_6px_rgba(0,0,0,0.3)] transition disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2", children: isLoading ? (_jsxs(_Fragment, { children: [_jsx("div", { className: "w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" }), _jsx("span", { children: "Signing In..." })] })) : (_jsx("span", { children: "Sign In to Admin Console" })) })] }), _jsxs("div", { className: "mt-8 pt-6 border-t border-slate-100", children: [_jsx("p", { className: "text-[10px] font-extrabold uppercase tracking-widest text-slate-400 mb-3 text-center", children: "Quick Role Switch (Testing & QA)" }), _jsx("div", { className: "space-y-2", children: quickRoles.map((role) => {
                                        const isSelected = username === role.username;
                                        return (_jsxs("button", { type: "button", onClick: () => {
                                                setUsername(role.username);
                                                setPassword('password123');
                                            }, className: `w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all duration-150 ${isSelected
                                                ? 'bg-[#E6F4FA] border-[#23759B]/50 shadow-[0_4px_10px_rgba(0,80,110,0.1),inset_0_1px_1px_rgba(255,255,255,0.9)] transform -translate-y-0.5'
                                                : 'bg-[#F8FAFC] border-slate-200/80 hover:bg-white hover:border-slate-300 shadow-[0_2px_4px_rgba(0,0,0,0.03)]'}`, children: [_jsxs("div", { children: [_jsx("span", { className: `text-xs font-black block ${isSelected ? 'text-[#00506E]' : 'text-slate-800'}`, children: role.label }), _jsx("span", { className: "text-[10px] text-slate-500 font-medium block", children: role.desc })] }), _jsx("span", { className: `text-[10px] font-mono font-bold px-2 py-0.5 rounded-lg border ${isSelected
                                                        ? 'bg-white text-[#00506E] border-[#23759B]/30'
                                                        : 'bg-slate-200/70 text-slate-600 border-slate-200'}`, children: role.username })] }, role.username));
                                    }) })] })] }) })] }));
};
//# sourceMappingURL=LoginPage.js.map