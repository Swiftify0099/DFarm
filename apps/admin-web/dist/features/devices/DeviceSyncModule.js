import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import { deviceApi, } from '../../api/deviceApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
export const DeviceSyncModule = () => {
    const { currentCenterId, hasRole } = useAuth();
    const { showToast } = useToast();
    const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
    const canManageDevices = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER']);
    const [activeTab, setActiveTab] = useState('devices');
    const [loading, setLoading] = useState(true);
    const [devices, setDevices] = useState([]);
    const [conflicts, setConflicts] = useState([]);
    const [events, setEvents] = useState([]);
    // Policy Approval Modal
    const [approvalModalOpen, setApprovalModalOpen] = useState(false);
    const [selectedDevice, setSelectedDevice] = useState(null);
    const [maxHours, setMaxHours] = useState(72);
    const [submittingApproval, setSubmittingApproval] = useState(false);
    // Revoke Modal
    const [revokeModalOpen, setRevokeModalOpen] = useState(false);
    const [revokeReason, setRevokeReason] = useState('');
    const [submittingRevoke, setSubmittingRevoke] = useState(false);
    // Conflict Details Modal
    const [conflictModalOpen, setConflictModalOpen] = useState(false);
    const [selectedConflict, setSelectedConflict] = useState(null);
    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [devRes, confRes, evtRes] = await Promise.all([
                deviceApi.listDevices({ centerId: currentCenterId || undefined }).catch(() => []),
                deviceApi.getConflicts().catch(() => []),
                deviceApi.getEvents().catch(() => []),
            ]);
            setDevices(Array.isArray(devRes) ? devRes : []);
            setConflicts(Array.isArray(confRes) ? confRes : []);
            setEvents(Array.isArray(evtRes) ? evtRes : []);
        }
        catch (err) {
            showToast('Failed to load device & synchronization data: ' + err.message, 'error');
        }
        finally {
            setLoading(false);
        }
    }, [currentCenterId, showToast]);
    useEffect(() => {
        loadData();
    }, [loadData]);
    // Approve Offline Policy
    const handleOpenApprove = (d) => {
        setSelectedDevice(d);
        setMaxHours(d.maxOfflineHours || 72);
        setApprovalModalOpen(true);
    };
    const handleConfirmApproval = async (e) => {
        e.preventDefault();
        if (!selectedDevice)
            return;
        setSubmittingApproval(true);
        try {
            await deviceApi.approveOfflinePolicy(selectedDevice.id, maxHours);
            showToast(`Offline authorization approved for ${selectedDevice.deviceIdentifier} (${maxHours}h)`, 'success');
            setApprovalModalOpen(false);
            loadData();
        }
        catch (err) {
            showToast('Approval failed: ' + err.message, 'error');
        }
        finally {
            setSubmittingApproval(false);
        }
    };
    // Revoke Device
    const handleOpenRevoke = (d) => {
        setSelectedDevice(d);
        setRevokeReason('');
        setRevokeModalOpen(true);
    };
    const handleConfirmRevoke = async (e) => {
        e.preventDefault();
        if (!selectedDevice)
            return;
        if (!revokeReason.trim()) {
            showToast('Revocation reason is required', 'warning');
            return;
        }
        setSubmittingRevoke(true);
        try {
            await deviceApi.revokeDevice(selectedDevice.id, revokeReason);
            showToast(`Device ${selectedDevice.deviceIdentifier} revoked and blocked!`, 'success');
            setRevokeModalOpen(false);
            loadData();
        }
        catch (err) {
            showToast('Revocation failed: ' + err.message, 'error');
        }
        finally {
            setSubmittingRevoke(false);
        }
    };
    return (_jsxs("div", { className: "space-y-6", children: [_jsxs("div", { className: "flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200", children: [_jsxs("div", { children: [_jsx("h1", { className: "text-2xl font-bold text-gray-900 tracking-tight", children: "\uD83D\uDCF1 Terminals, Devices & Synchronization" }), _jsx("p", { className: "text-sm text-gray-500 mt-1", children: "Provisioned field terminals, cryptographically signed offline policies, sync reconciliation, and conflict resolution." })] }), _jsx("button", { onClick: loadData, className: "px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition", children: "\uD83D\uDD04 Refresh" })] }), _jsxs("div", { className: "flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold", children: [_jsxs("button", { onClick: () => setActiveTab('devices'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'devices'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: ["\uD83D\uDCBB Registered Devices (", devices.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab('conflicts'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'conflicts'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: ["\u26A0\uFE0F Sync Conflicts (", conflicts.length, ")"] }), _jsxs("button", { onClick: () => setActiveTab('events'), className: `px-4 py-2 rounded-t-lg transition whitespace-nowrap ${activeTab === 'events'
                            ? 'bg-emerald-600 text-white shadow'
                            : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'}`, children: ["\uD83D\uDCDC Sync Audit Stream (", events.length, ")"] })] }), _jsxs("div", { className: "bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 text-xs flex items-center justify-between", children: [_jsxs("div", { children: [_jsx("strong", { children: "Cryptographic Safeguard:" }), " Terminal authorization tokens use ECDSA Secp256k1 offline verification envelopes. Private keys and biometric template data are never transmitted or exposed in admin web interfaces."] }), _jsx("span", { className: "font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-[11px] font-semibold", children: "ZERO EMBEDDING EXPOSURE" })] }), activeTab === 'devices' && (_jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsx("h2", { className: "font-semibold text-gray-800 text-sm", children: "Hardware Terminal Fleet" }), _jsx("span", { className: "text-xs text-gray-500", children: "Field POS and Collection Stations" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Device Identifier" }), _jsx("th", { className: "px-4 py-3", children: "Type" }), _jsx("th", { className: "px-4 py-3", children: "Center" }), _jsx("th", { className: "px-4 py-3", children: "Last Seen" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Offline Policy" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Status" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Actions" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: loading ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-12 text-center text-gray-500", children: "Loading registered devices..." }) })) : devices.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 7, className: "px-4 py-12 text-center text-gray-500", children: "No hardware devices provisioned for this organization/center." }) })) : (devices.map((d) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "px-4 py-3 whitespace-nowrap", children: [_jsx("div", { className: "font-mono font-medium text-gray-900", children: d.deviceIdentifier }), _jsxs("div", { className: "text-[11px] text-gray-500", children: ["App v", d.clientAppVersion || '1.0.0'] })] }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap", children: _jsx("span", { className: "text-xs font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200", children: d.deviceType }) }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-800", children: d.centerName || d.centerCode || 'Main Center' }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap text-xs text-gray-600", children: d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never' }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: d.offlineAuthPolicyApproved ? (_jsxs("span", { className: "inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200", children: ["\u2713 ", d.approvedMaxOfflineHours || d.maxOfflineHours || 72, "h Max"] })) : (_jsx("span", { className: "text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200", children: "Unapproved (Online Only)" })) }), _jsx("td", { className: "px-4 py-3 text-center", children: _jsx(StatusBadge, { status: d.status }) }), _jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: _jsxs("div", { className: "flex items-center justify-end gap-1.5", children: [canManageDevices && !d.offlineAuthPolicyApproved && (_jsx("button", { onClick: () => handleOpenApprove(d), className: "px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-medium transition", children: "Approve Offline" })), isOwnerOrAdmin && d.status !== 'BLOCKED' && d.status !== 'DECOMMISSIONED' && (_jsx("button", { onClick: () => handleOpenRevoke(d), className: "px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-medium transition", children: "Revoke" }))] }) })] }, d.id)))) })] }) })] })), activeTab === 'conflicts' && (_jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsx("h2", { className: "font-semibold text-gray-800 text-sm", children: "Synchronization Conflicts" }), _jsx("span", { className: "text-xs text-gray-500", children: "Resolved automatically or requiring manual reconciliation" })] }), _jsx("div", { className: "overflow-x-auto", children: _jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Logged At" }), _jsx("th", { className: "px-4 py-3", children: "Device" }), _jsx("th", { className: "px-4 py-3", children: "Entity" }), _jsx("th", { className: "px-4 py-3", children: "Conflict Reason" }), _jsx("th", { className: "px-4 py-3 text-center", children: "Resolution" }), _jsx("th", { className: "px-4 py-3 text-right", children: "Details" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: conflicts.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 6, className: "px-4 py-12 text-center text-gray-500", children: "\uD83C\uDF89 Zero synchronization conflicts recorded. All offline terminal intakes are cleanly settled." }) })) : (conflicts.map((c) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsx("td", { className: "px-4 py-3 whitespace-nowrap text-xs", children: new Date(c.recordedAt).toLocaleString() }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-800", children: c.deviceIdentifier || c.deviceId.slice(0, 8) }), _jsx("td", { className: "px-4 py-3 whitespace-nowrap text-xs font-bold text-gray-700", children: c.entityType }), _jsx("td", { className: "px-4 py-3 text-xs text-rose-600 font-medium", children: c.conflictReason }), _jsx("td", { className: "px-4 py-3 text-center whitespace-nowrap", children: _jsx(StatusBadge, { status: c.resolvedBy ? 'RESOLVED' : 'UNRESOLVED' }) }), _jsx("td", { className: "px-4 py-3 text-right whitespace-nowrap", children: _jsx("button", { onClick: () => {
                                                        setSelectedConflict(c);
                                                        setConflictModalOpen(true);
                                                    }, className: "px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition", children: "\uD83D\uDD0D Inspect" }) })] }, c.id)))) })] }) })] })), activeTab === 'events' && (_jsxs("div", { className: "bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden", children: [_jsxs("div", { className: "p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50", children: [_jsx("h2", { className: "font-semibold text-gray-800 text-sm", children: "Downstream Sync Event Log" }), _jsx("span", { className: "text-xs text-gray-500", children: "Ordered mutation event sequence for edge caches" })] }), _jsx("div", { className: "overflow-x-auto max-h-[500px]", children: _jsxs("table", { className: "w-full text-left text-sm text-gray-600", children: [_jsx("thead", { className: "bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0", children: _jsxs("tr", { children: [_jsx("th", { className: "px-4 py-3", children: "Seq #" }), _jsx("th", { className: "px-4 py-3", children: "Timestamp" }), _jsx("th", { className: "px-4 py-3", children: "Entity Type" }), _jsx("th", { className: "px-4 py-3", children: "Action" }), _jsx("th", { className: "px-4 py-3", children: "Entity ID" })] }) }), _jsx("tbody", { className: "divide-y divide-gray-200", children: events.length === 0 ? (_jsx("tr", { children: _jsx("td", { colSpan: 5, className: "px-4 py-12 text-center text-gray-500", children: "No downstream sync events recorded." }) })) : (events.map((evt) => (_jsxs("tr", { className: "hover:bg-gray-50 transition", children: [_jsxs("td", { className: "px-4 py-3 font-mono font-bold text-xs text-gray-700", children: ["#", evt.eventSequence] }), _jsx("td", { className: "px-4 py-3 text-xs text-gray-600 whitespace-nowrap", children: new Date(evt.createdAt).toLocaleString() }), _jsx("td", { className: "px-4 py-3 font-medium text-xs text-gray-800", children: evt.entityType }), _jsx("td", { className: "px-4 py-3", children: _jsx("span", { className: `text-[10px] font-bold px-2 py-0.5 rounded ${evt.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                                                        evt.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`, children: evt.action }) }), _jsx("td", { className: "px-4 py-3 font-mono text-xs text-gray-500", children: evt.entityId })] }, evt.id)))) })] }) })] })), _jsx(Modal, { isOpen: approvalModalOpen, onClose: () => setApprovalModalOpen(false), title: `Approve Offline Policy — ${selectedDevice?.deviceIdentifier}`, maxWidth: "md", children: _jsxs("form", { onSubmit: handleConfirmApproval, className: "space-y-4", children: [_jsx("p", { className: "text-xs text-gray-600", children: "Authorizing offline operation allows the terminal to collect milk without live network connectivity. Collections are queued locally and synchronized once connectivity resumes." }), _jsxs("div", { children: [_jsx("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: "Maximum Allowed Offline Hours" }), _jsx("input", { type: "number", min: 1, max: 168, value: maxHours, onChange: (e) => setMaxHours(parseInt(e.target.value, 10) || 72), className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true }), _jsx("span", { className: "text-[11px] text-gray-500 mt-1 block", children: "Default is 72 hours (3 operational dairy days)." })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-3 border-t border-gray-200", children: [_jsx("button", { type: "button", onClick: () => setApprovalModalOpen(false), className: "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submittingApproval, className: "px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: submittingApproval ? 'Signing...' : 'Approve Offline Policy' })] })] }) }), _jsx(Modal, { isOpen: revokeModalOpen, onClose: () => setRevokeModalOpen(false), title: `Revoke Terminal — ${selectedDevice?.deviceIdentifier}`, maxWidth: "md", children: _jsxs("form", { onSubmit: handleConfirmRevoke, className: "space-y-4", children: [_jsxs("div", { className: "bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg", children: [_jsx("strong", { children: "Warning:" }), " Revoking a terminal invalidates its cryptographic registration token immediately. The terminal will be prevented from syncing or collecting milk."] }), _jsxs("div", { children: [_jsxs("label", { className: "block text-xs font-medium text-gray-700 mb-1", children: ["Revocation Reason ", _jsx("span", { className: "text-red-500", children: "*" })] }), _jsx("textarea", { rows: 3, value: revokeReason, onChange: (e) => setRevokeReason(e.target.value), placeholder: "e.g. Device reported lost, hardware replaced, or security compromise suspected.", className: "w-full px-3 py-2 border border-gray-300 rounded-lg text-sm", required: true })] }), _jsxs("div", { className: "flex justify-end gap-2 pt-3 border-t border-gray-200", children: [_jsx("button", { type: "button", onClick: () => setRevokeModalOpen(false), className: "px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition", children: "Cancel" }), _jsx("button", { type: "submit", disabled: submittingRevoke, className: "px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50", children: submittingRevoke ? 'Revoking...' : 'Confirm Revocation' })] })] }) }), _jsx(Modal, { isOpen: conflictModalOpen, onClose: () => setConflictModalOpen(false), title: "Sync Conflict Inspection", maxWidth: "2xl", children: selectedConflict && (_jsxs("div", { className: "space-y-3 text-xs", children: [_jsxs("div", { className: "grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded border border-gray-200", children: [_jsxs("div", { children: [_jsx("strong", { children: "Entity:" }), " ", selectedConflict.entityType, " (", selectedConflict.entityId, ")"] }), _jsxs("div", { children: [_jsx("strong", { children: "Idempotency Key:" }), " ", selectedConflict.idempotencyKey] }), _jsxs("div", { children: [_jsx("strong", { children: "Reason:" }), " ", _jsx("span", { className: "text-rose-600", children: selectedConflict.conflictReason })] }), _jsxs("div", { children: [_jsx("strong", { children: "Recorded:" }), " ", new Date(selectedConflict.recordedAt).toLocaleString()] })] }), _jsxs("div", { children: [_jsx("div", { className: "font-semibold text-gray-700 mb-1", children: "Client Offline Payload:" }), _jsx("pre", { className: "bg-gray-100 p-3 rounded font-mono overflow-x-auto text-[11px] max-h-40", children: JSON.stringify(selectedConflict.clientPayload, null, 2) })] }), _jsxs("div", { children: [_jsx("div", { className: "font-semibold text-gray-700 mb-1", children: "Server DB State:" }), _jsx("pre", { className: "bg-gray-100 p-3 rounded font-mono overflow-x-auto text-[11px] max-h-40", children: JSON.stringify(selectedConflict.serverState, null, 2) })] }), _jsx("div", { className: "flex justify-end pt-2", children: _jsx("button", { onClick: () => setConflictModalOpen(false), className: "px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium", children: "Close" }) })] })) })] }));
};
//# sourceMappingURL=DeviceSyncModule.js.map