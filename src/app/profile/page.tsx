"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/auth.context";
import { api } from "@/app/lib/api";


export default function ProfilePage() {
  const { role, resortName, email, setAuth, refreshFromStorage } = useAuth();
  const [name, setName] = useState(resortName ?? "");
  const [emailInput, setEmailInput] = useState(email ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setName(resortName ?? "");
  }, [resortName]);

  useEffect(() => {
    setEmailInput(email ?? "");
  }, [email]);

  const canManageProfile = useMemo(() => role === 'resort' || role === 'partnership', [role]);

  const resetMessages = () => {
    setNotice(null);
    setError(null);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    resetMessages();
    if (!canManageProfile) {
      setError('Only resort or partnership accounts can update profile information.');
      return;
    }

    const trimmedName = name.trim();
    const trimmedEmail = emailInput.trim();
    const payload: Record<string, string> = {};

    if (trimmedName && trimmedName !== (resortName ?? "")) {
      payload.resortName = trimmedName;
    }
    if (trimmedEmail && trimmedEmail !== (email ?? "")) {
      payload.email = trimmedEmail.toLowerCase();
    }
    if (password) {
      if (password.length < 6) {
        setError('Password must be at least 6 characters.');
        return;
      }
      if (password !== confirmPassword) {
        setError('Password confirmation does not match.');
        return;
      }
      payload.password = password;
    }

    if (Object.keys(payload).length === 0) {
      setError('No changes detected. Update your name, email, or password first.');
      return;
    }

    try {
      setSaving(true);
      const { data } = await api.put('/auth/profile', payload);
      if (!data) {
        setError('Failed to update profile.');
        return;
      }
      if (data.error) {
        setError(typeof data.error === 'string' ? data.error : 'Failed to update profile.');
        return;
      }
      if (!data.ok || !data.accessToken || !data.user) {
        setError('Profile update response was incomplete.');
        return;
      }
      setAuth({ token: data.accessToken, role: data.user?.role || 'resort', email: data.user?.email || payload.email || email || '', resortName: data.user?.resortName || payload.resortName || resortName || '' });
      try { refreshFromStorage(); } catch {}
      setName(data.user?.resortName || payload.resortName || name);
      setEmailInput(data.user?.email || payload.email || emailInput);
      setPassword('');
      setConfirmPassword('');
      setNotice('Profile updated successfully.');
    } catch (err: any) {
      const detail = err?.response?.data?.error || err?.response?.data?.message || err?.message || 'Failed to update profile.';
      setError(detail);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-tr from-sky-50 to-emerald-50 p-[1px] shadow-sm">
        <div className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-100 text-sky-700 ring-1 ring-sky-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M19.5 21v-1.125a4.125 4.125 0 0 0-4.125-4.125h-6.75A4.125 4.125 0 0 0 4.5 19.875V21m9-11.25a3.75 3.75 0 1 0-7.5 0 3.75 3.75 0 0 0 7.5 0Zm6 6.75-2.5 2.5-1.5-1.5"/></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Account Profile</h1>
            <p className="text-sm text-slate-600">View and update your account details.</p>
            </div>
          </div>
        </div>
      </section>

      {!canManageProfile ? (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <div className="text-sm text-slate-700">Only resort or partnership accounts can update profile details. If you are a super admin, use the Resorts management page to edit resort or partnership accounts.</div>
        </section>
      ) : (
        <section className="rounded-2xl border border-slate-200 bg-white/90 p-6 shadow-sm">
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-4">
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Resort Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Resort name"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Email</label>
                <input
                  type="email"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="email@example.com"
                  className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                  autoCapitalize="none"
                  autoComplete="email"
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">New Password</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Leave blank to keep current password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    autoComplete="new-password"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Confirm Password</label>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repeat new password"
                    className="w-full rounded-xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none ring-1 ring-slate-200 transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
                    autoComplete="new-password"
                  />
                </div>
              </div>
            </div>

            {notice && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-700 ring-1 ring-emerald-200">{notice}</div>}
            {error && <div className="rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center justify-center rounded-xl bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? 'Saving...' : 'Save changes'}
              </button>
              <button
                type="button"
                onClick={() => { resetMessages(); refreshFromStorage(); setName(resortName ?? ''); setEmailInput(email ?? ''); setPassword(''); setConfirmPassword(''); }}
                className="inline-flex items-center justify-center rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
              >
                Reset
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
    
  );


}
