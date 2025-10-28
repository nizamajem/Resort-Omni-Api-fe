"use client";

import { useEffect, useState } from "react";
import { Switch } from "@/app/components/ui/switch";
import { api } from "@/app/lib/api";

type PackageId = '1h' | '3h' | '12h' | '1d';
type RentalExtraKey = 'extraGraceMinutes' | 'extraBlockMinutes' | 'extraHourlyRate';
type PackageRole = 'resort' | 'partnership';
type CustomPackageConfig = {
  id: string;
  name: string;
  blockMinutes: number;
  pricePerBlock: number;
  enabled?: boolean;
  description?: string | null;
  roles?: PackageRole[];
};

type FeatureConfig = {
  packages: Record<PackageId, boolean>;
  packageRoles: Record<PackageId, PackageRole[]>;
  payments: { cash: boolean; midtransSandbox: boolean; midtransProduction: boolean };
  packagePrices: Record<PackageId, number>;
  rentalExtras: Record<RentalExtraKey, number>;
  customPackages: CustomPackageConfig[];
};

type ToggleKey = { id: PackageId; label: string; description: string };
type PaymentToggle = { id: 'cash' | 'midtransSandbox' | 'midtransProduction'; label: string; description: string };
type RoleToggle = { id: PackageRole; label: string };

const PACKAGE_OPTIONS: ToggleKey[] = [
  { id: '1h', label: '1 Hour Package', description: 'Enable resorts to order the 1 hour bundle.' },
  { id: '3h', label: '3 Hour Package', description: 'Enable resorts to order the 3 hour bundle.' },
  { id: '12h', label: '12 Hour Package', description: 'Enable resorts to order the 12 hour bundle.' },
  { id: '1d', label: '1 Day Package', description: 'Enable resorts to order the 1 day bundle.' },
];
const PACKAGE_IDS: PackageId[] = PACKAGE_OPTIONS.map((pkg) => pkg.id);
const ROLE_OPTIONS: RoleToggle[] = [
  { id: 'resort', label: 'Resort Accounts' },
  { id: 'partnership', label: 'Partnership Accounts' },
];

const PAYMENT_OPTIONS: PaymentToggle[] = [
  { id: 'cash', label: 'Cash Payment', description: 'Allow resorts to settle orders using cash at the counter.' },
  { id: 'midtransSandbox', label: 'Online Payment (Midtrans Sandbox)', description: 'Show Midtrans checkout when the system runs in sandbox mode.' },
  { id: 'midtransProduction', label: 'Online Payment (Midtrans Production)', description: 'Show Midtrans checkout when the system runs in production mode.' },
];

const RENTAL_EXTRA_FIELDS: { key: RentalExtraKey; label: string; description: string; unit?: string; prefix?: string }[] = [
  { key: 'extraGraceMinutes', label: 'Grace Period', description: 'Minutes before overtime charges apply.', unit: 'minutes' },
  { key: 'extraBlockMinutes', label: 'Overtime Block Duration', description: 'Minutes grouped before overtime charges add up.', unit: 'minutes' },
  { key: 'extraHourlyRate', label: 'Overtime Charge Per Block', description: 'Charge applied for each overtime block.', prefix: 'Rp' },
];

type RoleSelections = Record<PackageId, Record<PackageRole, boolean>>;
type CustomPackageDraft = {
  key: string;
  id: string;
  name: string;
  blockMinutes: string;
  pricePerBlock: string;
  enabled: boolean;
  description: string;
  roles: Record<PackageRole, boolean>;
};

const createDefaultRoleSelection = (): Record<PackageRole, boolean> => ({ resort: true, partnership: true });
const normalizeCustomRoles = (roles?: PackageRole[] | null): Record<PackageRole, boolean> => {
  const next: Record<PackageRole, boolean> = { resort: false, partnership: false };
  if (Array.isArray(roles)) {
    roles.forEach((role) => {
      if (role === 'resort' || role === 'partnership') {
        next[role] = true;
      }
    });
  }
  if (!next.resort && !next.partnership) {
    return { resort: true, partnership: true };
  }
  return next;
};
const computeRoleSelections = (config: FeatureConfig | null): RoleSelections => {
  const base = {} as RoleSelections;
  PACKAGE_IDS.forEach((id) => {
    const defaults = createDefaultRoleSelection();
    const allowed = Array.isArray(config?.packageRoles?.[id]) ? new Set(config?.packageRoles?.[id]) : null;
    if (allowed) {
      base[id] = {
        resort: allowed.has('resort'),
        partnership: allowed.has('partnership'),
      };
    } else {
      base[id] = defaults;
    }
  });
  return base;
};
const slugifyId = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
const toCustomDraft = (pkg: CustomPackageConfig, index: number): CustomPackageDraft => ({
  key: pkg.id || `existing-${index}`,
  id: pkg.id || '',
  name: pkg.name || '',
  blockMinutes: pkg.blockMinutes !== undefined ? String(pkg.blockMinutes) : '',
  pricePerBlock: pkg.pricePerBlock !== undefined ? String(pkg.pricePerBlock) : '',
  enabled: pkg.enabled !== false,
  description: pkg.description ? String(pkg.description) : '',
  roles: normalizeCustomRoles(pkg.roles),
});
const createEmptyCustomDraft = (): CustomPackageDraft => ({
  key: `new-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
  id: '',
  name: '',
  blockMinutes: '',
  pricePerBlock: '',
  enabled: true,
  description: '',
  roles: normalizeCustomRoles(['resort', 'partnership']),
});

export default function AdminSettingsPage() {
  const [features, setFeatures] = useState<FeatureConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [priceInputs, setPriceInputs] = useState<Record<PackageId, string>>({ '1h': '', '3h': '', '12h': '', '1d': '' });
  const [priceSaving, setPriceSaving] = useState<PackageId | null>(null);

  const [extraInputs, setExtraInputs] = useState<Record<RentalExtraKey, string>>({ extraGraceMinutes: '', extraBlockMinutes: '', extraHourlyRate: '' });
  const [extraSaving, setExtraSaving] = useState<RentalExtraKey | null>(null);
  const [roleSelections, setRoleSelections] = useState<RoleSelections>(() => computeRoleSelections(null));
  const [customDrafts, setCustomDrafts] = useState<CustomPackageDraft[]>([]);
  const [customSaving, setCustomSaving] = useState(false);
  const [customNotice, setCustomNotice] = useState<string | null>(null);
  const [customError, setCustomError] = useState<string | null>(null);

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
      setPriceInputs({ '1h': '', '3h': '', '12h': '', '1d': '' });
      setExtraInputs({ extraGraceMinutes: '', extraBlockMinutes: '', extraHourlyRate: '' });
      setRoleSelections(computeRoleSelections(null));
      setCustomDrafts([]);
      setCustomNotice(null);
      setCustomError(null);
      return;
    }
    setPriceInputs({
      '1h': features.packagePrices?.['1h'] !== undefined ? String(features.packagePrices['1h']) : '',
      '3h': features.packagePrices?.['3h'] !== undefined ? String(features.packagePrices['3h']) : '',
      '12h': features.packagePrices?.['12h'] !== undefined ? String(features.packagePrices['12h']) : '',
      '1d': features.packagePrices?.['1d'] !== undefined ? String(features.packagePrices['1d']) : '',
    });
    setExtraInputs({
      extraGraceMinutes: features.rentalExtras?.extraGraceMinutes !== undefined ? String(features.rentalExtras.extraGraceMinutes) : '',
      extraBlockMinutes: features.rentalExtras?.extraBlockMinutes !== undefined ? String(features.rentalExtras.extraBlockMinutes) : '',
      extraHourlyRate: features.rentalExtras?.extraHourlyRate !== undefined ? String(features.rentalExtras.extraHourlyRate) : '',
    });
    setRoleSelections(computeRoleSelections(features));
    setCustomDrafts(Array.isArray(features.customPackages) ? features.customPackages.map((pkg, index) => toCustomDraft(pkg, index)) : []);
    setCustomNotice(null);
    setCustomError(null);
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
  const updatePackageRoles = async (pkgId: PackageId, roleId: PackageRole, next: boolean) => {
    const currentSelection = roleSelections[pkgId] ?? createDefaultRoleSelection();
    const nextSelection = { ...currentSelection, [roleId]: next };
    setRoleSelections((prev) => ({ ...prev, [pkgId]: nextSelection }));
    const allowedRoles = Object.entries(nextSelection)
      .filter(([, value]) => value)
      .map(([key]) => key as PackageRole);
    try {
      setSavingKey(`packageRoles:${pkgId}:${roleId}`);
      setMessage(null);
      setError(null);
      const { data } = await api.put('/settings/features', { packageRoles: { [pkgId]: allowedRoles } });
      setFeatures((data || null) as FeatureConfig | null);
      setMessage('Changes saved.');
    } catch {
      setError('Failed to save changes.');
      setRoleSelections(computeRoleSelections(features));
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

  const handleExtraChange = (key: RentalExtraKey, next: string) => {
    const sanitized = next.replace(/[^0-9]/g, '');
    setExtraInputs((prev) => ({ ...prev, [key]: sanitized }));
  };

const saveExtra = async (key: RentalExtraKey) => {
  const raw = extraInputs[key];
  if (raw === '') {
    setError('Please enter a value before saving.');
    return;
  }
  const numeric = Number(raw);
  const isGrace = key === 'extraGraceMinutes';
  const isValid = Number.isFinite(numeric) && (isGrace ? numeric >= 0 : numeric > 0);
  if (!isValid) {
    setError('Please enter a valid value before saving.');
    return;
  }
  try {
    setExtraSaving(key);
    setMessage(null);
    setError(null);
    const payloadValue = Math.round(numeric);

    // 1) Simpan
    await api.put('/settings/features', { rentalExtras: { [key]: payloadValue } });

    // 2) REFRESH setelah simpan (penting jika server tidak mengembalikan state lengkap)
    const { data } = await api.get('/settings/features');
    setFeatures((data || null) as FeatureConfig | null);

    setMessage('Changes saved.');
  } catch {
    setError('Failed to save value.');
  } finally {
    setExtraSaving(null);
  }
};

  const updateCustomDraft = (draftKey: string, patch: Partial<CustomPackageDraft>) => {
    setCustomDrafts((prev) => prev.map((item) => (item.key === draftKey ? { ...item, ...patch } : item)));
    setCustomNotice(null);
    setCustomError(null);
  };

  const removeCustomDraft = (draftKey: string) => {
    setCustomDrafts((prev) => prev.filter((item) => item.key !== draftKey));
    setCustomNotice(null);
    setCustomError(null);
  };

  const addCustomDraft = () => {
    setCustomDrafts((prev) => [...prev, createEmptyCustomDraft()]);
    setCustomNotice(null);
    setCustomError(null);
  };

  const saveCustomPackages = async () => {
    setCustomSaving(true);
    setCustomNotice(null);
    setCustomError(null);
    try {
      const payload: CustomPackageConfig[] = [];
      const seen = new Set<string>();
      for (const draft of customDrafts) {
        const name = draft.name.trim();
        if (!name) {
          setCustomError('Please provide a name for each custom package.');
          return;
        }
        const minutes = Number(draft.blockMinutes);
        if (!Number.isFinite(minutes) || minutes <= 0) {
          setCustomError('Block duration must be a positive number of minutes.');
          return;
        }
        const rate = Number(draft.pricePerBlock);
        if (!Number.isFinite(rate) || rate <= 0) {
          setCustomError('Price per block must be a positive amount.');
          return;
        }
        const slugSource = draft.id.trim() || name;
        const slug = slugifyId(slugSource);
        if (!slug) {
          setCustomError('Unable to generate an ID for one of the custom packages. Adjust the name and try again.');
          return;
        }
        if (seen.has(slug)) {
          setCustomError('Duplicate custom package detected. Please use unique names or IDs.');
          return;
        }
        seen.add(slug);
        const selectedRoles = (Object.entries(draft.roles || {}) as [PackageRole, boolean][])
          .filter(([, value]) => value)
          .map(([role]) => role);
        if (selectedRoles.length === 0) {
          setCustomError('Select at least one account type for each custom package.');
          return;
        }
        const entry: CustomPackageConfig = {
          id: slug,
          name,
          blockMinutes: Math.round(minutes),
          pricePerBlock: Math.round(rate),
          enabled: draft.enabled,
          roles: selectedRoles,
        };
        const desc = draft.description.trim();
        if (desc) {
          entry.description = desc;
        }
        payload.push(entry);
      }
      const { data } = await api.put('/settings/features', { customPackages: payload });
      setFeatures((data || null) as FeatureConfig | null);
      setCustomNotice('Custom packages saved.');
    } catch {
      setCustomError('Failed to save custom packages.');
    } finally {
      setCustomSaving(false);
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
              const roleState = roleSelections[pkg.id] ?? createDefaultRoleSelection();
              return (
                <div key={pkg.id} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
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
                  <div className="rounded-lg border border-slate-200 bg-white px-3 py-2">
                    <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Allowed Roles</div>
                    <div className="mt-2 flex flex-wrap gap-4">
                      {ROLE_OPTIONS.map((roleOption) => {
                        const roleChecked = roleState[roleOption.id];
                        const roleBusy = savingKey === `packageRoles:${pkg.id}:${roleOption.id}`;
                        return (
                          <div key={roleOption.id} className="flex items-center gap-2 text-xs text-slate-700">
                            <Switch
                              checked={roleChecked}
                              disabled={loading || roleBusy}
                              onChange={(next) => updatePackageRoles(pkg.id, roleOption.id, next)}
                            />
                            <span>{roleOption.label}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
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
                        suppressHydrationWarning
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
            <h2 className="text-lg font-semibold text-slate-900">Custom Packages</h2>
            <p className="text-sm text-slate-600">Define tiered billing packages with custom block durations and rates.</p>
          </div>
          {customError && (
            <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{customError}</div>
          )}
          {customNotice && (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{customNotice}</div>
          )}
          <div className="space-y-4">
            {customDrafts.length === 0 ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
                No custom packages yet. Add one to offer flexible billing.
              </div>
            ) : (
              customDrafts.map((draft) => {
                const slugPreview = slugifyId(draft.id || draft.name);
                const disabled = loading || customSaving;
                const minutesPreview = Number(draft.blockMinutes);
                const pricePreview = Number(draft.pricePerBlock);
                const previewLabel =
                  Number.isFinite(minutesPreview) && minutesPreview > 0 && Number.isFinite(pricePreview) && pricePreview > 0
                    ? `${formatIDR(pricePreview)} per ${minutesPreview} minute block`
                    : 'Set block duration and price to see the preview';
                return (
                  <div key={draft.key} className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex-1">
                        <label className="text-xs font-medium text-slate-600">Package name</label>
                        <input
                          value={draft.name}
                          onChange={(event) => updateCustomDraft(draft.key, { name: event.target.value })}
                          disabled={disabled}
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                          placeholder="e.g. Special Package"
                        />
                      </div>
                    <div className="space-y-3">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium text-slate-600">Enabled</span>
                        <Switch checked={draft.enabled} disabled={disabled} onChange={(next) => updateCustomDraft(draft.key, { enabled: next })} />
                      </div>
                      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700">
                        <span className="font-medium text-slate-600">Available for</span>
                        {ROLE_OPTIONS.map((roleOption) => {
                          const checked = !!draft.roles[roleOption.id];
                          return (
                            <label key={roleOption.id} className="flex items-center gap-2">
                              <Switch
                                checked={checked}
                                disabled={disabled}
                                onChange={(next) => {
                                  const nextRoles = { ...draft.roles, [roleOption.id]: next } as Record<PackageRole, boolean>;
                                  updateCustomDraft(draft.key, { roles: nextRoles });
                                }}
                              />
                              <span>{roleOption.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div>
                        <label className="text-xs font-medium text-slate-600">Block duration (minutes)</label>
                        <input
                          value={draft.blockMinutes}
                          onChange={(event) => updateCustomDraft(draft.key, { blockMinutes: event.target.value.replace(/[^0-9]/g, '') })}
                          disabled={disabled}
                          inputMode="numeric"
                          pattern="[0-9]*"
                          className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                          placeholder="e.g. 10"
                        />
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Price per block</label>
                        <div className="mt-1 flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
                          <span className="mr-2 text-xs font-medium text-slate-500">Rp</span>
                          <input
                            value={draft.pricePerBlock}
                            onChange={(event) => updateCustomDraft(draft.key, { pricePerBlock: event.target.value.replace(/[^0-9]/g, '') })}
                            disabled={disabled}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            className="h-6 w-full border-none bg-transparent text-right text-sm font-semibold text-slate-900 outline-none focus:ring-0"
                            placeholder="e.g. 20000"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="text-xs font-medium text-slate-600">Package ID</label>
                        <div className="mt-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-mono text-slate-700 shadow-sm">
                          {slugPreview || 'auto-generated'}
                        </div>
                      </div>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-slate-600">Notes (optional)</label>
                      <textarea
                        value={draft.description}
                        onChange={(event) => updateCustomDraft(draft.key, { description: event.target.value })}
                        disabled={disabled}
                        rows={2}
                        className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-200"
                        placeholder="Optional internal note for this package"
                      />
                    </div>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div className="text-xs text-slate-500">{previewLabel}</div>
                      <button
                        type="button"
                        onClick={() => removeCustomDraft(draft.key)}
                        disabled={disabled}
                        className="self-end rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 shadow-sm transition hover:bg-rose-100 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={addCustomDraft}
              disabled={loading || customSaving}
              className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              Add custom package
            </button>
            <button
              type="button"
              onClick={saveCustomPackages}
              disabled={loading || customSaving}
              className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {customSaving ? 'Saving...' : 'Save custom packages'}
            </button>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-slate-900">Rental Extras</h2>
            <p className="text-sm text-slate-600">Configure grace period and overtime charges shown on the dashboard. This function is not applicable for custom packages.</p>
          </div>
          <div className="space-y-4">
            {RENTAL_EXTRA_FIELDS.map((field) => {
              const key = field.key;
              const saving = extraSaving === key;
              const disabled = loading || saving;
              const inputValue = extraInputs[key] ?? '';
              const currentValue = features?.rentalExtras?.[key];
              const numericInput = inputValue === '' ? NaN : Number(inputValue);
              const isGraceField = key === 'extraGraceMinutes';
              const canSave =
                !disabled &&
                inputValue !== '' &&
                Number.isFinite(numericInput) &&
                (isGraceField ? numericInput >= 0 : numericInput > 0);
              const normalizedInput = Number.isFinite(numericInput) ? Math.round(numericInput) : NaN;
              const currentIsNumber = typeof currentValue === 'number' && Number.isFinite(currentValue);
              const normalizedCurrent = currentIsNumber ? Math.round(currentValue as number) : NaN;
              const unchanged =
                Number.isFinite(normalizedInput) &&
                Number.isFinite(normalizedCurrent) &&
                normalizedInput === normalizedCurrent;
              const saveDisabled = !canSave || unchanged;
              const currentLabel = currentIsNumber
                ? field.prefix === 'Rp'
                  ? formatIDR(currentValue as number)
                  : `${normalizedCurrent}${field.unit ? ` ${field.unit}` : ''}`
                : '-';
              return (
                <div key={field.key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">{field.label}</div>
                    <div className="text-xs text-slate-600">Current: {currentLabel}</div>
                    <div className="text-xs text-slate-500">{field.description}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex items-center rounded-lg border border-slate-300 bg-white px-3 py-2 shadow-sm">
                      {field.prefix ? <span className="mr-2 text-xs font-medium text-slate-500">{field.prefix}</span> : null}
                      <input
                        suppressHydrationWarning
                        value={inputValue}
                        onChange={(event) => handleExtraChange(key, event.target.value)}
                        disabled={disabled}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-8 w-28 border-none bg-transparent text-right text-sm font-semibold text-slate-900 outline-none focus:ring-0"
                        placeholder="0"
                      />
                      {field.unit ? <span className="ml-2 text-xs font-medium text-slate-500">{field.unit}</span> : null}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveExtra(key)}
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
