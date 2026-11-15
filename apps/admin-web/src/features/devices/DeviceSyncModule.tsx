import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.js';
import { useToast } from '../../context/ToastContext.js';
import {
  deviceApi,
  type DeviceInfo,
  type SyncConflictRecord,
  type SyncEventRecord,
} from '../../api/deviceApi.js';
import { StatusBadge } from '../../components/Badge.js';
import { Modal } from '../../components/Modal.js';
import { ClayButton } from '../../components/ClayButton.js';

export const DeviceSyncModule: React.FC = () => {
  const { currentCenterId, hasRole } = useAuth();
  const { showToast } = useToast();

  const isOwnerOrAdmin = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER']);
  const canManageDevices = hasRole(['SUPER_ADMIN', 'DAIRY_OWNER', 'CENTER_MANAGER']);

  const [activeTab, setActiveTab] = useState<'devices' | 'conflicts' | 'events'>('devices');
  const [loading, setLoading] = useState<boolean>(true);
  const [devices, setDevices] = useState<DeviceInfo[]>([]);
  const [conflicts, setConflicts] = useState<SyncConflictRecord[]>([]);
  const [events, setEvents] = useState<SyncEventRecord[]>([]);

  // Policy Approval Modal
  const [approvalModalOpen, setApprovalModalOpen] = useState<boolean>(false);
  const [selectedDevice, setSelectedDevice] = useState<DeviceInfo | null>(null);
  const [maxHours, setMaxHours] = useState<number>(72);
  const [submittingApproval, setSubmittingApproval] = useState<boolean>(false);

  // Revoke Modal
  const [revokeModalOpen, setRevokeModalOpen] = useState<boolean>(false);
  const [revokeReason, setRevokeReason] = useState<string>('');
  const [submittingRevoke, setSubmittingRevoke] = useState<boolean>(false);

  // Conflict Details Modal
  const [conflictModalOpen, setConflictModalOpen] = useState<boolean>(false);
  const [selectedConflict, setSelectedConflict] = useState<SyncConflictRecord | null>(null);

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
    } catch (err: any) {
      showToast('Failed to load device & synchronization data: ' + err.message, 'error');
    } finally {
      setLoading(false);
    }
  }, [currentCenterId, showToast]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Approve Offline Policy
  const handleOpenApprove = (d: DeviceInfo) => {
    setSelectedDevice(d);
    setMaxHours(d.maxOfflineHours || 72);
    setApprovalModalOpen(true);
  };

  const handleConfirmApproval = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
    setSubmittingApproval(true);
    try {
      await deviceApi.approveOfflinePolicy(selectedDevice.id, maxHours);
      showToast(`Offline authorization approved for ${selectedDevice.deviceIdentifier} (${maxHours}h)`, 'success');
      setApprovalModalOpen(false);
      loadData();
    } catch (err: any) {
      showToast('Approval failed: ' + err.message, 'error');
    } finally {
      setSubmittingApproval(false);
    }
  };

  // Revoke Device
  const handleOpenRevoke = (d: DeviceInfo) => {
    setSelectedDevice(d);
    setRevokeReason('');
    setRevokeModalOpen(true);
  };

  const handleConfirmRevoke = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedDevice) return;
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
    } catch (err: any) {
      showToast('Revocation failed: ' + err.message, 'error');
    } finally {
      setSubmittingRevoke(false);
    }
  };

  return (
    <div className="space-y-6 select-none">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-3 border-b border-slate-200/80">
        <div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <span>📱</span>
            <span>Terminals, Devices & Synchronization</span>
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
            Provisioned field terminals, cryptographically signed offline policies, sync reconciliation, and conflict resolution.
          </p>
        </div>
        <ClayButton
          variant="brand"
          size="sm"
          onClick={loadData}
          icon={<span>🔄</span>}
        >
          Refresh
        </ClayButton>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-200/80 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'devices'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>💻</span>
          <span>Registered Devices ({devices.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('conflicts')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'conflicts'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>⚠️</span>
          <span>Sync Conflicts ({conflicts.length})</span>
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2.5 rounded-t-xl transition-all duration-150 whitespace-nowrap flex items-center gap-2 font-bold ${
            activeTab === 'events'
              ? 'bg-white text-[#00506E] border-b-2 border-[#00506E] shadow-[0_-4px_12px_rgba(0,80,110,0.06),inset_0_2px_2px_rgba(255,255,255,0.95)]'
              : 'text-slate-600 hover:text-[#00506E] hover:bg-white/60'
          }`}
        >
          <span>📜</span>
          <span>Sync Audit Stream ({events.length})</span>
        </button>
      </div>

      {/* Security Privacy Notice */}
      <div className="clay-surface p-5 border border-sky-100/90 shadow-[8px_12px_24px_-4px_rgba(2,132,199,0.06),inset_1px_1px_2px_rgba(255,255,255,0.95)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3 text-xs text-slate-700">
          <span className="text-xl shrink-0">🛡️</span>
          <div>
            <strong className="text-slate-900 font-black">Cryptographic Safeguard:</strong> Terminal authorization tokens use ECDSA Secp256k1 offline verification envelopes. Private keys and biometric template data are never transmitted or exposed in admin web interfaces.
          </div>
        </div>
        <span className="font-mono bg-[#E6F4FA] text-[#00506E] border border-sky-200 px-3 py-1 rounded-full text-[10px] font-black tracking-wider uppercase shrink-0 shadow-sm">
          ZERO EMBEDDING EXPOSURE
        </span>
      </div>

      {/* Tab: Devices */}
      {activeTab === 'devices' && (
        <div className="clay-surface overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50/70 to-white">
            <div className="flex items-center gap-2">
              <span className="text-base">🖥️</span>
              <h2 className="font-black text-slate-800 text-sm tracking-tight">Hardware Terminal Fleet</h2>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Field POS and Collection Stations
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Device Identifier</th>
                  <th className="px-4 py-3.5">Type</th>
                  <th className="px-4 py-3.5">Center</th>
                  <th className="px-4 py-3.5">Last Seen</th>
                  <th className="px-4 py-3.5 text-center">Offline Policy</th>
                  <th className="px-4 py-3.5 text-center">Status</th>
                  <th className="px-4 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 font-bold">
                      Loading registered devices...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-slate-500 font-bold">
                      No hardware devices provisioned for this organization/center.
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono font-black text-slate-900">{d.deviceIdentifier}</div>
                        <div className="text-[11px] text-slate-400 font-medium">App v{d.clientAppVersion || '1.0.0'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-[10px] font-mono font-bold bg-[#EDF2F7] text-slate-700 px-2.5 py-0.5 rounded-full border border-slate-200">
                          {d.deviceType}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-800">
                        {d.centerName || d.centerCode || 'Main Center'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                        {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {d.offlineAuthPolicyApproved ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-black text-[#137333] bg-[#E6F4EA] px-2.5 py-0.5 rounded-full border border-emerald-200 shadow-sm">
                            ✓ {d.approvedMaxOfflineHours || d.maxOfflineHours || 72}h Max
                          </span>
                        ) : (
                          <span className="text-[11px] font-bold text-[#B06000] bg-[#FEF7E0] px-2.5 py-0.5 rounded-full border border-amber-200">
                            Unapproved (Online Only)
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <StatusBadge status={d.status} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {canManageDevices && !d.offlineAuthPolicyApproved && (
                            <button
                              onClick={() => handleOpenApprove(d)}
                              className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-[#137333] border border-emerald-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                            >
                              Approve Offline
                            </button>
                          )}
                          {isOwnerOrAdmin && d.status !== 'BLOCKED' && d.status !== 'DECOMMISSIONED' && (
                            <button
                              onClick={() => handleOpenRevoke(d)}
                              className="px-2.5 py-1 bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                            >
                              Revoke
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
      )}

      {/* Tab: Conflicts */}
      {activeTab === 'conflicts' && (
        <div className="clay-surface overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50/70 to-white">
            <div className="flex items-center gap-2">
              <span className="text-base">⚡</span>
              <h2 className="font-black text-slate-800 text-sm tracking-tight">Synchronization Conflicts</h2>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Resolved automatically or requiring manual reconciliation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3.5">Logged At</th>
                  <th className="px-4 py-3.5">Device</th>
                  <th className="px-4 py-3.5">Entity</th>
                  <th className="px-4 py-3.5">Conflict Reason</th>
                  <th className="px-4 py-3.5 text-center">Resolution</th>
                  <th className="px-4 py-3.5 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {conflicts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      <div className="flex flex-col items-center justify-center space-y-2">
                        <span className="text-3xl">🎉</span>
                        <p className="font-bold text-slate-800">Zero synchronization conflicts recorded.</p>
                        <p className="text-[11px] text-slate-400">All offline terminal intakes are cleanly settled with PostgreSQL master.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  conflicts.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-slate-500">
                        {new Date(c.recordedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs font-bold text-slate-900">
                        {c.deviceIdentifier || c.deviceId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-slate-800">
                        {c.entityType}
                      </td>
                      <td className="px-4 py-3 text-xs text-[#C5221F] font-bold">
                        {c.conflictReason}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        <StatusBadge status={c.resolvedBy ? 'RESOLVED' : 'UNRESOLVED'} />
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          onClick={() => {
                            setSelectedConflict(c);
                            setConflictModalOpen(true);
                          }}
                          className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-lg text-xs font-bold shadow-sm transition active:translate-y-0.5"
                        >
                          🔍 Inspect
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tab: Events */}
      {activeTab === 'events' && (
        <div className="clay-surface overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-100 flex justify-between items-center bg-gradient-to-r from-slate-50/70 to-white">
            <div className="flex items-center gap-2">
              <span className="text-base">📜</span>
              <h2 className="font-black text-slate-800 text-sm tracking-tight">Downstream Sync Event Log</h2>
            </div>
            <span className="text-[11px] font-bold text-slate-400">
              Ordered mutation event sequence for edge caches
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-xs sm:text-sm text-slate-600">
              <thead className="bg-[#F8FAFC] text-[11px] font-black text-slate-500 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3.5">Seq #</th>
                  <th className="px-4 py-3.5">Timestamp</th>
                  <th className="px-4 py-3.5">Entity Type</th>
                  <th className="px-4 py-3.5">Action</th>
                  <th className="px-4 py-3.5">Entity ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-slate-500 font-bold">
                      No downstream sync events recorded.
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="px-4 py-3 font-mono font-black text-xs text-slate-800">
                        #{evt.eventSequence}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {new Date(evt.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-bold text-xs text-slate-800">
                        {evt.entityType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                          evt.action === 'CREATE' ? 'bg-[#E6F4EA] text-[#137333]' :
                          evt.action === 'UPDATE' ? 'bg-[#E8F0FE] text-[#1A73E8]' : 'bg-[#FCE8E6] text-[#C5221F]'
                        }`}>
                          {evt.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-slate-400">
                        {evt.entityId}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Offline Approval Modal */}
      <Modal
        isOpen={approvalModalOpen}
        onClose={() => setApprovalModalOpen(false)}
        title={`Approve Offline Policy — ${selectedDevice?.deviceIdentifier}`}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmApproval} className="space-y-4 text-xs">
          <p className="text-slate-600 font-medium leading-relaxed">
            Authorizing offline operation allows the terminal to collect milk without live network connectivity. Collections are queued locally and synchronized once connectivity resumes.
          </p>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
              Maximum Allowed Offline Hours
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={maxHours}
              onChange={(e) => setMaxHours(parseInt(e.target.value, 10) || 72)}
              className="w-full px-3 py-2 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#00506E]"
              required
            />
            <span className="text-[11px] text-slate-400 font-medium mt-1 block">
              Default is 72 hours (3 operational dairy days).
            </span>
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setApprovalModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="brand"
              size="sm"
              disabled={submittingApproval}
              isLoading={submittingApproval}
            >
              Approve Offline Policy
            </ClayButton>
          </div>
        </form>
      </Modal>

      {/* Revocation Modal */}
      <Modal
        isOpen={revokeModalOpen}
        onClose={() => setRevokeModalOpen(false)}
        title={`Revoke Terminal — ${selectedDevice?.deviceIdentifier}`}
        maxWidth="md"
      >
        <form onSubmit={handleConfirmRevoke} className="space-y-4 text-xs">
          <div className="bg-[#FFF6F6] border border-rose-200/90 text-rose-800 text-xs p-4 rounded-2xl shadow-sm leading-normal">
            <strong className="font-black">Warning:</strong> Revoking a terminal invalidates its cryptographic registration token immediately. The terminal will be prevented from syncing or collecting milk.
          </div>

          <div>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-700 mb-1">
              Revocation Reason <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Device reported lost, hardware replaced, or security compromise suspected."
              className="w-full px-3 py-2.5 bg-[#EDF2F7] border border-slate-200/90 rounded-xl text-xs font-medium text-slate-800 shadow-[inset_1.5px_1.5px_3px_rgba(15,23,42,0.05)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-rose-500"
              required
            />
          </div>

          <div className="flex justify-end gap-2.5 pt-3 border-t border-slate-100">
            <ClayButton
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setRevokeModalOpen(false)}
            >
              Cancel
            </ClayButton>
            <ClayButton
              type="submit"
              variant="danger"
              size="sm"
              disabled={submittingRevoke}
              isLoading={submittingRevoke}
            >
              Confirm Revocation
            </ClayButton>
          </div>
        </form>
      </Modal>

      {/* Conflict Inspector Modal */}
      <Modal
        isOpen={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        title="Sync Conflict Inspection"
        maxWidth="2xl"
      >
        {selectedConflict && (
          <div className="space-y-4 text-xs">
            <div className="grid grid-cols-2 gap-3 bg-[#F8FAFC] p-4 rounded-2xl border border-slate-200/80 shadow-[inset_1px_1px_2px_rgba(15,23,42,0.03)] font-semibold">
              <div><strong>Entity:</strong> {selectedConflict.entityType} ({selectedConflict.entityId})</div>
              <div><strong>Idempotency Key:</strong> <span className="font-mono text-slate-600">{selectedConflict.idempotencyKey}</span></div>
              <div><strong>Reason:</strong> <span className="text-[#C5221F] font-black">{selectedConflict.conflictReason}</span></div>
              <div><strong>Recorded:</strong> {new Date(selectedConflict.recordedAt).toLocaleString()}</div>
            </div>

            <div>
              <div className="font-extrabold text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider">Client Offline Payload:</div>
              <pre className="bg-[#EDF2F7] p-3.5 rounded-2xl border border-slate-200/90 font-mono overflow-x-auto text-[11px] max-h-40 shadow-[inset_1.5px_1.5px_3px_rgba(0,0,0,0.04)] text-slate-800">
                {JSON.stringify(selectedConflict.clientPayload, null, 2)}
              </pre>
            </div>

            <div>
              <div className="font-extrabold text-slate-700 mb-1.5 uppercase text-[10px] tracking-wider">Server DB State:</div>
              <pre className="bg-[#EDF2F7] p-3.5 rounded-2xl border border-slate-200/90 font-mono overflow-x-auto text-[11px] max-h-40 shadow-[inset_1.5px_1.5px_3px_rgba(0,0,0,0.04)] text-slate-800">
                {JSON.stringify(selectedConflict.serverState, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <ClayButton
                variant="secondary"
                size="sm"
                onClick={() => setConflictModalOpen(false)}
              >
                Close
              </ClayButton>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
