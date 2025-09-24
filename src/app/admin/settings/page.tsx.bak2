"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/app/components/ui/switch";
import { api } from "@/app/lib/api";

type PackageId = '1h' | '3h' | '1d';

type FeatureConfig = {
  packages: Record<PackageId, boolean>;
  payments: { cash: boolean; midtransSandbox: boolean; midtransProduction: boolean };
  packagePrices: Record<PackageId, number>;
};

type ToggleKey = { id: PackageId; label: string; description: string };
type PaymentToggle = { id: 'cash' | 'midtransSandbox' | 'midtransProduction'; label: string; description: string };

const PACKAGE_OPTIONS: ToggleKey[] = [
  { id: '1h', label: '1 Hour Package', description: 'Enable resorts to order the 1 hour bundle.' },
  { id: '3h', label: '3 Hour Package', description: 'Enable resorts to order the 3 hour bundle.' },
  { id: '1d', label: '1 Day Package', description: 'Enable resorts to order the 1 day bundle.' },
];

const PAYMENT_OPTIONS: PaymentToggle[] = [
  { id: 'cash', label: 'Cash Payment', description: 'Allow resorts to settle orders using cash at the counter.' },
  { id: 'midtransSandbox', label: 'Online Payment (Midtrans Sandbox)', description: 'Show Midtrans checkout when the system runs in sandbox mode.' },
  { id: 'midtransProduction', label: 'Online Payment (Midtrans Production)', description: 'Show Midtrans checkout when the system runs in production mode.' },
];

export default function AdminSettingsPage() {
  const [features, setFeatures] = useState<FeatureConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [priceInputs, setPriceInputs] = useState<Record<PackageId, string>>({ '1h': '', '3h': '', '1d': '' });
  const [priceSaving, setPriceSaving] = useState<PackageId | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setMessage(null);
        setError(null);
        const { data } = await api.get('/settings/features');
        setFeatures((data || null) as FeatureConfig | null);
      } catch {
        setError('Failed to load feature toggles.');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  useEffect(() => {
    if (!features) {
      setPriceInputs({ '1h': '', '3h': '', '1d': '' });
      return;
    }
    setPriceInputs({
      '1h': features.packagePrices?.['1h'] !== undefined ? String(features.packagePrices['1h']) : '',
      '3h': features.packagePrices?.['3h'] !== undefined ? String(features.packagePrices['3h']) : '',
      '1d': features.packagePrices?.['1d'] !== undefined ? String(features.packagePrices['1d']) : '',
    });
  }, [features]);

  const updateFeature = async (type: 'packages' | 'payments', id: string, next: boolean) => {
    try {
      setSavingKey(`${type}:${id}`);
      setMessage(null);
      setError(null);
      const payload = type === 'packages' ? { packages: { [id]: next } } : { payments: { [id]: next } };
      const { data } = await api.put('/settings/features', payload);
      setFeatures((data || null) as FeatureConfig | null);
      setMessage('Changes saved.');
    } catch {
      setError('Failed to save changes.');
    } finally {
      setSavingKey(null);
    }
  };

  const formatIDR = (value: number | undefined) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '-';
    return new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(Math.round(value));
  };

  const handlePriceChange = (pkgId: PackageId, next: string) => {
    const sanitized = next.replace(/[^0-9]/g, '');
    setPriceInputs((prev) => ({ ...prev, [pkgId]: sanitized }));
  };

  const savePrice = async (pkgId: PackageId) => {
    const raw = priceInputs[pkgId];
    if (!raw) {
      setError('Please enter a valid price before saving.');
      return;
    }
    const numeric = Number(raw);
    if (!Number.isFinite(numeric) || numeric <= 0) {
      setError('Please enter a valid price before saving.');
      return;
    }
    try {
      setPriceSaving(pkgId);
      setMessage(null);
      setError(null);
      const { data } = await api.put('/settings/features', { packagePrices: { [pkgId]: Math.round(numeric) } });
      setFeatures((data || null) as FeatureConfig | null);
      setMessage('Changes saved.');
    } catch {
      setError('Failed to save price.');
    } finally {
      setPriceSaving(null);
    }
  };

  return (
    <main className="space-y-8 px-4 pb-10 pt-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Feature Toggles</h1>
        <p className="text-sm text-slate-600">Control which packages and payment methods are visible to resorts.</p>
      </header>

      {message && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{message}</div>
      )}
      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</div>
      )}

      <section className="grid gap-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Packages</h2>
            <p className="text-sm text-slate-600">Toggle which rental packages partners can see and purchase.</p>
          </div>
          <div className="space-y-4">
            {PACKAGE_OPTIONS.map((pkg) => {
              const checked = features ? !!features.packages[pkg.id] : true;
              const busy = savingKey === `packages:${pkg.id}`;
              return (
                <div key={pkg.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{pkg.label}</div>
                    <div className="text-xs text-slate-600">{pkg.description}</div>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={loading || busy}
                    onChange={(next) => updateFeature('packages', pkg.id, next)}
                  />
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Package Pricing</h2>
            <p className="text-sm text-slate-600">Adjust the default package prices shown on the resort dashboard.</p>
          </div>
          <div className="space-y-4">
            {PACKAGE_OPTIONS.map((pkg) => {
              const pkgId = pkg.id;
              const saving = priceSaving === pkgId;
              const disabled = loading || saving;
              const inputValue = priceInputs[pkgId] ?? '';
              const original = features?.packagePrices?.[pkgId];
              const numericInput = inputValue === '' ? NaN : Number(inputValue);
              const canSave = !disabled && inputValue !== '' && Number.isFinite(numericInput) && numericInput > 0;
              const unchanged = Number.isFinite(numericInput) && typeof original === 'number' && Math.round(numericInput) === Math.round(original);
              const saveDisabled = !canSave || unchanged;
              return (
                <div key={pkg.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{pkg.label}</div>
                    <div className="text-xs text-slate-600">Current: {formatIDR(original)}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
                      <span className="mr-2 text-xs font-medium text-slate-500">Rp</span>
                      <input
                        value={inputValue}
                        onChange={(event) => handlePriceChange(pkgId, event.target.value)}
                        disabled={disabled}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-8 w-28 border-none bg-transparent text-right text-sm font-semibold text-slate-900 outline-none focus:ring-0"
                        placeholder="0"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => savePrice(pkgId)}
                      disabled={saveDisabled}
                      className="h-9 rounded-lg bg-sky-600 px-4 text-xs font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {saving ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Payment Methods</h2>
            <p className="text-sm text-slate-600">Enable or disable cash and Midtrans checkout options.</p>
          </div>
          <div className="space-y-4">
            {PAYMENT_OPTIONS.map((pay) => {
              const checked = features ? !!features.payments[pay.id] : true;
              const busy = savingKey === `payments:${pay.id}`;
              return (
                <div key={pay.id} className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{pay.label}</div>
                    <div className="text-xs text-slate-600">{pay.description}</div>
                  </div>
                  <Switch
                    checked={checked}
                    disabled={loading || busy}
                    onChange={(next) => updateFeature('payments', pay.id, next)}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {loading && (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">Loading feature configuration...</div>
      )}
    </main>
  );
}
