import React, { useState, useEffect } from 'react';
import { feedApi } from '../../api/feedApi.js';
import { FeedSupplier } from '@dfarm/shared-types';

export const SupplierList: React.FC = () => {
  const [suppliers, setSuppliers] = useState<FeedSupplier[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);

  // Form fields
  const [supplierCode, setSupplierCode] = useState<string>('');
  const [name, setName] = useState<string>('');
  const [contactPerson, setContactPerson] = useState<string>('');
  const [phoneNumber, setPhoneNumber] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [address, setAddress] = useState<string>('');
  const [gstNumber, setGstNumber] = useState<string>('');
  const [panNumber, setPanNumber] = useState<string>('');
  const [saving, setSaving] = useState<boolean>(false);

  const loadSuppliers = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await feedApi.getSuppliers();
      setSuppliers(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load suppliers');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSuppliers();
  }, []);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setSaving(true);
      setError(null);
      await feedApi.createSupplier({
        supplierCode: supplierCode.trim().toUpperCase(),
        name: name.trim(),
        contactPerson: contactPerson.trim() || null,
        phoneNumber: phoneNumber.trim(),
        email: email.trim() || null,
        address: address.trim() || null,
        gstNumber: gstNumber.trim().toUpperCase() || null,
        panNumber: panNumber.trim().toUpperCase() || null,
      });

      setIsModalOpen(false);
      setSupplierCode('');
      setName('');
      setContactPerson('');
      setPhoneNumber('');
      setEmail('');
      setAddress('');
      setGstNumber('');
      setPanNumber('');
      loadSuppliers();
    } catch (err: any) {
      setError(err.message || 'Failed to register supplier');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="supplier-list clay-card rounded-3xl p-6 sm:p-8 bg-white shadow-clay-card border border-white/80 space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Cattle Feed Suppliers</h2>
          <p className="text-sm text-slate-500 font-medium">
            Manage procurement vendors, GSTIN credentials, and outstanding payable balances
          </p>
        </div>
        <button
          onClick={() => setIsModalOpen(true)}
          className="clay-btn-brand bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white font-bold px-5 py-2.5 rounded-xl shadow-clay-button text-xs tracking-wide active:scale-95 transition-all flex items-center gap-2"
        >
          <span>➕</span> Register Supplier
        </button>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-sm font-semibold shadow-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm font-semibold space-y-2">
          <div className="w-8 h-8 border-3 border-emerald-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Loading suppliers...</div>
        </div>
      ) : suppliers.length === 0 ? (
        <div className="text-center py-16 clay-inset rounded-2xl bg-slate-50/80 text-slate-500 text-sm font-semibold">
          No registered feed suppliers found.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-200/80 shadow-sm">
          <table className="min-w-full divide-y divide-slate-200 text-sm text-left">
            <thead className="bg-[#F8FAFC] text-slate-600 font-extrabold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-4 py-3.5">Code</th>
                <th className="px-4 py-3.5">Supplier Name</th>
                <th className="px-4 py-3.5">Contact Person</th>
                <th className="px-4 py-3.5">Phone & Email</th>
                <th className="px-4 py-3.5">GSTIN / PAN</th>
                <th className="px-4 py-3.5">Outstanding Balance</th>
                <th className="px-4 py-3.5">Status</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-100">
              {suppliers.map((s) => (
                <tr key={s.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3.5 font-mono font-bold text-slate-900 bg-slate-50/50">{s.supplierCode}</td>
                  <td className="px-4 py-3.5 font-bold text-slate-900">{s.name}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">{s.contactPerson || '-'}</td>
                  <td className="px-4 py-3.5 text-slate-600 font-medium">
                    <div className="font-semibold text-slate-800">{s.phoneNumber}</div>
                    {s.email && <div className="text-xs text-slate-400">{s.email}</div>}
                  </td>
                  <td className="px-4 py-3.5 font-mono text-xs text-slate-600 font-bold">
                    <div>{s.gstNumber || '-'}</div>
                    {s.panNumber && <div className="text-slate-400">{s.panNumber}</div>}
                  </td>
                  <td className="px-4 py-3.5 font-black text-rose-700">
                    ₹{Number(s.outstandingBalance).toFixed(2)}
                  </td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-extrabold ${
                        s.status === 'ACTIVE'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-slate-100 text-slate-800 border border-slate-200'
                      }`}
                    >
                      {s.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="clay-card bg-white rounded-3xl shadow-2xl w-full max-w-lg overflow-hidden border border-white">
            <div className="px-6 py-4 bg-gradient-to-r from-emerald-800 to-teal-900 text-white flex justify-between items-center">
              <h3 className="font-black text-lg">Register Feed Supplier</h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center font-bold text-lg text-white transition-colors"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Supplier Code *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. SUP-MAHA-01"
                    value={supplierCode}
                    onChange={(e) => setSupplierCode(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Supplier Name *</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Maharashtra Agro Feeds"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Contact Person</label>
                  <input
                    type="text"
                    value={contactPerson}
                    onChange={(e) => setContactPerson(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Phone Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="+91..."
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">GSTIN</label>
                  <input
                    type="text"
                    placeholder="27AAAAA0000A1Z5"
                    value={gstNumber}
                    onChange={(e) => setGstNumber(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-mono font-bold uppercase focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-600 mb-1">Registered Address</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  className="w-full clay-inset bg-white border border-slate-300 rounded-xl px-3 py-2 text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-emerald-500 shadow-sm"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-xs font-bold text-slate-700 active:scale-95 transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="clay-btn-brand px-6 py-2 bg-gradient-to-r from-emerald-600 to-teal-700 hover:from-emerald-500 hover:to-teal-600 text-white rounded-xl text-xs font-extrabold shadow-clay-button disabled:opacity-50 active:scale-95 transition-all"
                >
                  {saving ? 'Registering...' : 'Register Supplier'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

