"use client";

import { useCallback, useMemo, useState } from "react";

type DurationType = "HOUR" | "DAY";

type Pkg = {
  id: string;              // id final dari backend
  name: string;
  durationType: DurationType;
  durationValue: number;
  price: number;
  isActive: boolean;
  _optimistic?: boolean;   // penanda lokal (tidak dikirim ke API)
};

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

async function createPackageAPI(input: Omit<Pkg, "id" | "_optimistic">) {
  const res = await fetch(`${API_URL}/packages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    // tambahkan Authorization Bearer <token> jika perlu
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(msg || `Create package failed (${res.status})`);
  }
  const data = await res.json();
  // diasumsikan API mengembalikan { id, name, durationType, durationValue, price, isActive }
  return data as Pkg;
}

async function togglePackageAPI(id: string, isActive: boolean) {
  const res = await fetch(`${API_URL}/packages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ isActive }),
  });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(msg || `Toggle package failed (${res.status})`);
  }
}

async function deletePackageAPI(id: string) {
  const res = await fetch(`${API_URL}/packages/${id}`, { method: "DELETE" });
  if (!res.ok) {
    const msg = await safeText(res);
    throw new Error(msg || `Delete package failed (${res.status})`);
  }
}

async function safeText(res: Response) {
  try {
    return await res.text();
  } catch {
    return "";
  }
}

export default function AdminPackagesAddPage() {
  // form state
  const [name, setName] = useState("");
  const [durationType, setDurationType] = useState<DurationType>("HOUR");
  const [durationValue, setDurationValue] = useState(1);
  const [price, setPrice] = useState(50_000);
  const [isActive, setIsActive] = useState(true);

  // table rows (dummy awal)
  const [rows, setRows] = useState<Pkg[]>([
    { id: "1h", name: "1 Hour", durationType: "HOUR", durationValue: 1, price: 50_000, isActive: true },
    { id: "3h", name: "3 Hours", durationType: "HOUR", durationValue: 3, price: 100_000, isActive: true },
    { id: "1d", name: "1 Day", durationType: "DAY", durationValue: 1, price: 200_000, isActive: true },
  ]);

  // utils
  const fmt = useMemo(
    () => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }),
    []
  );
  const fmtIDR = (n: number) => fmt.format(n);

  const resetForm = useCallback(() => {
    setName("");
    setDurationType("HOUR");
    setDurationValue(1);
    setPrice(50_000);
    setIsActive(true);
  }, []);

  // ---------- CREATE (optimistic) ----------
  const onAdd = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();

      const trimmed = name.trim();
      if (!trimmed) return;
      if (!Number.isFinite(durationValue) || durationValue <= 0) return;
      if (!Number.isFinite(price) || price < 0) return;

      // 1) optimistic insert (id sementara)
      const tempId = `temp_${Date.now()}`;
      const optimisticRow: Pkg = {
        id: tempId,
        name: trimmed,
        durationType,
        durationValue,
        price: Math.round(price),
        isActive,
        _optimistic: true,
      };
      setRows((prev) => [optimisticRow, ...prev]);

      try {
        // 2) call API
        const created = await createPackageAPI({
          name: trimmed,
          durationType,
          durationValue,
          price: Math.round(price),
          isActive,
        });

        // 3) commit: ganti row temp dengan row dari server (id final)
        setRows((prev) =>
          prev.map((r) => (r.id === tempId ? { ...created, _optimistic: false } : r))
        );

        resetForm();
      } catch (err: any) {
        // 4) rollback
        setRows((prev) => prev.filter((r) => r.id !== tempId));
        window.alert(err?.message || "Gagal membuat paket.");
      }
    },
    [name, durationType, durationValue, price, isActive, resetForm]
  );

  // ---------- TOGGLE ACTIVE (optimistic, opsional) ----------
  const toggle = useCallback(async (id: string) => {
    const target = rows.find((r) => r.id === id);
    if (!target) return;

    // optimistic toggle
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: !r.isActive } : r)));

    try {
      // kalau id masih temp (belum tersimpan di server), cukup update lokal
      if (!target.id.startsWith("temp_")) {
        await togglePackageAPI(id, !target.isActive);
      }
    } catch (err: any) {
      // rollback
      setRows((prev) => prev.map((r) => (r.id === id ? { ...r, isActive: target.isActive } : r)));
      window.alert(err?.message || "Gagal mengubah status paket.");
    }
  }, [rows]);

  // ---------- DELETE (optimistic, opsional) ----------
  const remove = useCallback(async (id: string) => {
    const before = rows;
    // optimistic remove
    setRows((prev) => prev.filter((r) => r.id !== id));
    try {
      if (!id.startsWith("temp_")) {
        await deletePackageAPI(id);
      }
    } catch (err: any) {
      // rollback
      setRows(before);
      window.alert(err?.message || "Gagal menghapus paket.");
    }
  }, [rows]);

  // input handlers anti-NaN
  const onDurationChange = useCallback((v: string) => {
    const n = Number(v);
    setDurationValue(Number.isFinite(n) && n > 0 ? Math.floor(n) : 1);
  }, []);

  const onPriceChange = useCallback((v: string) => {
    const n = Number(v);
    setPrice(Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0);
  }, []);

  return (
    <main className="space-y-6 p-6">
      <section className="rounded-xl border bg-white p-4">
        <h1 className="text-xl font-semibold text-slate-900">Add Package</h1>
        <p className="mt-1 text-sm text-slate-600">Create or manage available packages.</p>

        <form onSubmit={onAdd} className="mt-4 grid gap-3 sm:grid-cols-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. 1 Hour)"
            className="rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Package name"
          />

          <select
            value={durationType}
            onChange={(e) => setDurationType(e.target.value as DurationType)}
            className="rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            aria-label="Duration type"
          >
            <option value="HOUR">HOUR</option>
            <option value="DAY">DAY</option>
          </select>

          <input
            type="number"
            min={1}
            inputMode="numeric"
            value={durationValue}
            onChange={(e) => onDurationChange(e.target.value)}
            className="rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Duration value"
            aria-label="Duration value"
          />

          <input
            type="number"
            min={0}
            inputMode="numeric"
            value={price}
            onChange={(e) => onPriceChange(e.target.value)}
            className="rounded border px-3 py-2 outline-none focus:ring-2 focus:ring-sky-500"
            placeholder="Price (IDR)"
            aria-label="Price"
          />

          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4"
            />
            Active
          </label>

          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded bg-sky-600 px-4 py-2 text-white hover:bg-sky-700 active:scale-[0.99]"
            >
              Add
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="rounded border px-4 py-2 hover:bg-slate-50"
            >
              Reset
            </button>
          </div>
        </form>
      </section>

      <section className="overflow-x-auto rounded-xl border bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Duration</th>
              <th className="px-3 py-2">Price</th>
              <th className="px-3 py-2">Active</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t">
                <td className="px-3 py-2">{r.name}</td>
                <td className="px-3 py-2">
                  {r.durationValue} {r.durationType}
                </td>
                <td className="px-3 py-2">{fmtIDR(r.price)}</td>
                <td className="px-3 py-2">{r.isActive ? "Yes" : "No"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggle(r.id)}
                      className="rounded border px-3 py-1 text-xs hover:bg-slate-50"
                    >
                      {r.isActive ? "Disable" : "Activate"}
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      className="rounded border px-3 py-1 text-xs text-rose-700 hover:bg-rose-50"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-slate-500">
                  No data
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </main>
  );
}
