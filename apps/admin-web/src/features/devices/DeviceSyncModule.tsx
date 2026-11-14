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
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-2 border-b border-gray-200">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">📱 Terminals, Devices & Synchronization</h1>
          <p className="text-sm text-gray-500 mt-1">
            Provisioned field terminals, cryptographically signed offline policies, sync reconciliation, and conflict resolution.
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-gray-200 overflow-x-auto space-x-2 pb-1 text-sm font-semibold">
        <button
          onClick={() => setActiveTab('devices')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'devices'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          💻 Registered Devices ({devices.length})
        </button>
        <button
          onClick={() => setActiveTab('conflicts')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'conflicts'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          ⚠️ Sync Conflicts ({conflicts.length})
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`px-4 py-2 rounded-t-lg transition whitespace-nowrap ${
            activeTab === 'events'
              ? 'bg-emerald-600 text-white shadow'
              : 'text-gray-600 hover:text-emerald-600 hover:bg-gray-50'
          }`}
        >
          📜 Sync Audit Stream ({events.length})
        </button>
      </div>

      {/* Security Privacy Notice */}
      <div className="bg-blue-50 border border-blue-200 text-blue-900 rounded-xl p-4 text-xs flex items-center justify-between">
        <div>
          <strong>Cryptographic Safeguard:</strong> Terminal authorization tokens use ECDSA Secp256k1 offline verification envelopes. Private keys and biometric template data are never transmitted or exposed in admin web interfaces.
        </div>
        <span className="font-mono bg-blue-100 text-blue-800 px-2 py-1 rounded text-[11px] font-semibold">
          ZERO EMBEDDING EXPOSURE
        </span>
      </div>

      {/* Tab: Devices */}
      {activeTab === 'devices' && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-800 text-sm">Hardware Terminal Fleet</h2>
            <span className="text-xs text-gray-500">
              Field POS and Collection Stations
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Device Identifier</th>
                  <th className="px-4 py-3">Type</th>
                  <th className="px-4 py-3">Center</th>
                  <th className="px-4 py-3">Last Seen</th>
                  <th className="px-4 py-3 text-center">Offline Policy</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      Loading registered devices...
                    </td>
                  </tr>
                ) : devices.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-gray-500">
                      No hardware devices provisioned for this organization/center.
                    </td>
                  </tr>
                ) : (
                  devices.map((d) => (
                    <tr key={d.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="font-mono font-medium text-gray-900">{d.deviceIdentifier}</div>
                        <div className="text-[11px] text-gray-500">App v{d.clientAppVersion || '1.0.0'}</div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="text-xs font-mono bg-gray-100 text-gray-800 px-2 py-0.5 rounded border border-gray-200">
                          {d.deviceType}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-medium text-gray-800">
                        {d.centerName || d.centerCode || 'Main Center'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                        {d.lastSeenAt ? new Date(d.lastSeenAt).toLocaleString() : 'Never'}
                      </td>
                      <td className="px-4 py-3 text-center whitespace-nowrap">
                        {d.offlineAuthPolicyApproved ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            ✓ {d.approvedMaxOfflineHours || d.maxOfflineHours || 72}h Max
                          </span>
                        ) : (
                          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
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
                              className="px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 rounded text-xs font-medium transition"
                            >
                              Approve Offline
                            </button>
                          )}
                          {isOwnerOrAdmin && d.status !== 'BLOCKED' && d.status !== 'DECOMMISSIONED' && (
                            <button
                              onClick={() => handleOpenRevoke(d)}
                              className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded text-xs font-medium transition"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-800 text-sm">Synchronization Conflicts</h2>
            <span className="text-xs text-gray-500">
              Resolved automatically or requiring manual reconciliation
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider">
                <tr>
                  <th className="px-4 py-3">Logged At</th>
                  <th className="px-4 py-3">Device</th>
                  <th className="px-4 py-3">Entity</th>
                  <th className="px-4 py-3">Conflict Reason</th>
                  <th className="px-4 py-3 text-center">Resolution</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {conflicts.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-gray-500">
                      🎉 Zero synchronization conflicts recorded. All offline terminal intakes are cleanly settled.
                    </td>
                  </tr>
                ) : (
                  conflicts.map((c) => (
                    <tr key={c.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {new Date(c.recordedAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap font-mono text-xs text-gray-800">
                        {c.deviceIdentifier || c.deviceId.slice(0, 8)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs font-bold text-gray-700">
                        {c.entityType}
                      </td>
                      <td className="px-4 py-3 text-xs text-rose-600 font-medium">
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
                          className="px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded text-xs font-medium transition"
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
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
          <div className="p-4 border-b border-gray-200 flex justify-between items-center bg-gray-50/50">
            <h2 className="font-semibold text-gray-800 text-sm">Downstream Sync Event Log</h2>
            <span className="text-xs text-gray-500">
              Ordered mutation event sequence for edge caches
            </span>
          </div>

          <div className="overflow-x-auto max-h-[500px]">
            <table className="w-full text-left text-sm text-gray-600">
              <thead className="bg-gray-100 text-xs font-semibold text-gray-700 uppercase tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3">Seq #</th>
                  <th className="px-4 py-3">Timestamp</th>
                  <th className="px-4 py-3">Entity Type</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Entity ID</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {events.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                      No downstream sync events recorded.
                    </td>
                  </tr>
                ) : (
                  events.map((evt) => (
                    <tr key={evt.id} className="hover:bg-gray-50 transition">
                      <td className="px-4 py-3 font-mono font-bold text-xs text-gray-700">
                        #{evt.eventSequence}
                      </td>
                      <td className="px-4 py-3 text-xs text-gray-600 whitespace-nowrap">
                        {new Date(evt.createdAt).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 font-medium text-xs text-gray-800">
                        {evt.entityType}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          evt.action === 'CREATE' ? 'bg-emerald-100 text-emerald-800' :
                          evt.action === 'UPDATE' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {evt.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">
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
        <form onSubmit={handleConfirmApproval} className="space-y-4">
          <p className="text-xs text-gray-600">
            Authorizing offline operation allows the terminal to collect milk without live network connectivity. Collections are queued locally and synchronized once connectivity resumes.
          </p>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Maximum Allowed Offline Hours
            </label>
            <input
              type="number"
              min={1}
              max={168}
              value={maxHours}
              onChange={(e) => setMaxHours(parseInt(e.target.value, 10) || 72)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
            <span className="text-[11px] text-gray-500 mt-1 block">
              Default is 72 hours (3 operational dairy days).
            </span>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setApprovalModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingApproval}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
            >
              {submittingApproval ? 'Signing...' : 'Approve Offline Policy'}
            </button>
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
        <form onSubmit={handleConfirmRevoke} className="space-y-4">
          <div className="bg-rose-50 border border-rose-200 text-rose-800 text-xs p-3 rounded-lg">
            <strong>Warning:</strong> Revoking a terminal invalidates its cryptographic registration token immediately. The terminal will be prevented from syncing or collecting milk.
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Revocation Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g. Device reported lost, hardware replaced, or security compromise suspected."
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-gray-200">
            <button
              type="button"
              onClick={() => setRevokeModalOpen(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submittingRevoke}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-medium shadow-sm transition disabled:opacity-50"
            >
              {submittingRevoke ? 'Revoking...' : 'Confirm Revocation'}
            </button>
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
          <div className="space-y-3 text-xs">
            <div className="grid grid-cols-2 gap-2 bg-gray-50 p-3 rounded border border-gray-200">
              <div><strong>Entity:</strong> {selectedConflict.entityType} ({selectedConflict.entityId})</div>
              <div><strong>Idempotency Key:</strong> {selectedConflict.idempotencyKey}</div>
              <div><strong>Reason:</strong> <span className="text-rose-600">{selectedConflict.conflictReason}</span></div>
              <div><strong>Recorded:</strong> {new Date(selectedConflict.recordedAt).toLocaleString()}</div>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-1">Client Offline Payload:</div>
              <pre className="bg-gray-100 p-3 rounded font-mono overflow-x-auto text-[11px] max-h-40">
                {JSON.stringify(selectedConflict.clientPayload, null, 2)}
              </pre>
            </div>

            <div>
              <div className="font-semibold text-gray-700 mb-1">Server DB State:</div>
              <pre className="bg-gray-100 p-3 rounded font-mono overflow-x-auto text-[11px] max-h-40">
                {JSON.stringify(selectedConflict.serverState, null, 2)}
              </pre>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setConflictModalOpen(false)}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
};
