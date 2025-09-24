"use client";

import { useEffect, useMemo, useState } from "react";
import MidtransPopup from "@/app/components/midtrans.popup";
import { api } from "@/app/lib/api";

type Pkg = { id: "1h" | "3h" | "1d"; title: string; desc: string; price: number; unit: string };

type RentalExtrasConfig = { extraGraceMinutes: number; extraHourlyRate: number };

type FeatureConfig = {
  packages: Record<Pkg['id'], boolean>;
  payments: { cash: boolean; midtransSandbox: boolean; midtransProduction: boolean };
  packagePrices: Record<Pkg['id'], number>;
  rentalExtras: RentalExtrasConfig;
};

type PaymentOption = 'cash' | 'midtransSandbox' | 'midtransProduction';
type OnlinePaymentOption = Exclude<PaymentOption, 'cash'>;

const PAYMENT_LABELS: Record<PaymentOption, string> = {
  cash: 'Cash',
  midtransSandbox: 'Midtrans Sandbox (Test)',
  midtransProduction: 'Midtrans Production (Live)',
};

const PAYMENT_CONFIRM_COPY: Record<PaymentOption, string> = {
  cash: 'Record this order as a cash payment?',
  midtransSandbox: 'Open Midtrans sandbox checkout (QRIS and test wallets).',
  midtransProduction: 'Open Midtrans production checkout for a live payment.',
};



export default function DashboardPage() {
  const makeOrderId = (prefix: string, baseId: string) => {
    const cleanBase = baseId.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    const timePart = Date.now().toString(36).toUpperCase();
    const randomPart = Math.random().toString(36).slice(2, 6).toUpperCase();
    const suffix = cleanBase.slice(-6);
    const raw = `${prefix}${timePart}${randomPart}${suffix}`;
    return raw.slice(0, 48);
  };
  const basePackages = useMemo<Pkg[]>(
    () => [
      { id: "1h", title: "1 Hour", desc: "Perfect for short city rides.", price: 65000, unit: "hour" },
      { id: "3h", title: "3 Hours", desc: "Explore more with extra time.", price: 125000, unit: "3 hours" },
      { id: "1d", title: "1 Day", desc: "Full day adventure on e-bike.", price: 200000, unit: "day" },
    ],
    []
  );
  const [features, setFeatures] = useState<FeatureConfig | null>(null);

  // default fallback kalau belum ada di server
  const DEFAULTS = { grace: 10, rate: 65000, block: 60 };

  const extras = useMemo(() => ({
    grace: features?.rentalExtras?.extraGraceMinutes ?? DEFAULTS.grace,
    rate: features?.rentalExtras?.extraHourlyRate ?? DEFAULTS.rate,
    block: DEFAULTS.block, // kalau mau configurable juga, tinggal tambah field di backend
  }), [features]);


  const packages = useMemo(() => {
    const withPricing = basePackages.map((pkg) => {
      const override = features?.packagePrices?.[pkg.id];
      const numeric = Number(override);
      if (Number.isFinite(numeric) && numeric > 0) {
        return { ...pkg, price: Math.round(numeric) };
      }
      return pkg;
    });
    if (!features) return withPricing;
    return withPricing.filter((pkg) => features.packages?.[pkg.id] !== false);
  }, [basePackages, features]);

  const cashEnabled = features ? !!features.payments.cash : true;
  const sandboxEnabled = features ? !!features.payments.midtransSandbox : true;
  const productionEnabled = features ? !!features.payments.midtransProduction : true;
  const availablePayments = useMemo<PaymentOption[]>(() => {
    const entries: PaymentOption[] = [];
    if (cashEnabled) entries.push('cash');
    if (sandboxEnabled) entries.push('midtransSandbox');
    if (productionEnabled) entries.push('midtransProduction');
    return entries;
  }, [cashEnabled, sandboxEnabled, productionEnabled]);
  const hasAnyPayment = availablePayments.length > 0;

  const [detailFor, setDetailFor] = useState<Pkg | null>(null);
  const [orderFor, setOrderFor] = useState<Pkg | null>(null);
  const [guestInfoOpen, setGuestInfoOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  // initial payment modals removed; payment only on Pay Now
  const [confirmCashOpen, setConfirmCashOpen] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [openPrivacy, setOpenPrivacy] = useState(false);
  const [openAgreement, setOpenAgreement] = useState(false);
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapContext, setSnapContext] = useState<{ mode: 'extras'; rentalId?: string; amount?: number; paymentMode?: OnlinePaymentOption } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [lastOrderId, setLastOrderId] = useState<string | null>(null);
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  const [availability, setAvailability] = useState<{ '1h': number; '3h': number; '1d': number; enabled?: Record<'1h' | '3h' | '1d', boolean> } | null>(null);
  const [nowTick, setNowTick] = useState(0);
  const [loadedLocal, setLoadedLocal] = useState(false);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<RunningRental | null>(null);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<RunningRental | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOption | null>(null);

  type RunningRental = {
    id: string;
    guestName: string;
    roomNumber: string;
    pkg: Pkg["id"];
    packageName: string;
    basePrice: number;
    baseMinutes: number;
    startedAt: number;
    endedAt?: number;
    status: 'active' | 'unpaid';
    amountDue?: number;
    email: string;
    credentialEmail?: string;
  };
  const [running, setRunning] = useState<RunningRental[]>([]);

  const normalizeRental = (raw: any): RunningRental => {
    if (!raw) {
      return {
        id: '',
        guestName: 'Guest',
        roomNumber: '-',
        pkg: '1h',
        packageName: 'Package',
        basePrice: 0,
        baseMinutes: 0,
        startedAt: Date.now(),
        status: 'active',
        email: '',
      } as RunningRental;
    }
    const started = typeof raw.startedAt === 'number' ? raw.startedAt : Number(raw.startedAt ?? Date.now());
    const ended = raw.endedAt === null || raw.endedAt === undefined ? undefined : Number(raw.endedAt);
    const due = raw.amountDue === null || raw.amountDue === undefined ? undefined : Number(raw.amountDue);
    const rawEmail = typeof raw?.email === 'string' ? raw.email.trim() : '';
    const credentialEmail = typeof raw?.credentialEmail === 'string' ? raw.credentialEmail.trim() : '';
    const relatedCredentialEmail = typeof raw?.credential?.email === 'string' ? raw.credential.email.trim() : '';
    const emailResolved = rawEmail || credentialEmail || relatedCredentialEmail;
    const credentialResolved = credentialEmail || relatedCredentialEmail || rawEmail;

    const normalized: RunningRental = {
      id: String(raw.id ?? ''),
      guestName: raw.guestName ?? 'Guest',
      roomNumber: raw.roomNumber ?? '-',
      pkg: (raw.pkg ?? '1h') as RunningRental['pkg'],
      packageName: raw.packageName ?? raw.pkg ?? 'Package',
      basePrice: Number(raw.basePrice ?? 0),
      baseMinutes: Number(raw.baseMinutes ?? 0),
      startedAt: Number.isFinite(started) ? started : Date.now(),
      endedAt: Number.isFinite(ended ?? NaN) ? ended : undefined,
      status: raw.status === 'unpaid' ? 'unpaid' : 'active',
      amountDue: Number.isFinite(due ?? NaN) ? due : undefined,
      email: emailResolved,
      credentialEmail: credentialResolved || undefined,
    };
    const sanitized: any = { ...raw, ...normalized, credentialEmail: credentialResolved };
    if (Object.prototype.hasOwnProperty.call(sanitized, 'credentialPassword')) {
      delete sanitized.credentialPassword;
    }
    return sanitized as RunningRental;
  };

  // Backend base URL
  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);
  // Auth info (token + resort name)
  const [token, setToken] = useState<string | null>(null);
  const [resortName, setResortName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // Prefer localStorage token; fallback to cookie if present
  const readToken = () => {
    try {
      const ls = localStorage.getItem("token");
      if (ls && ls.trim()) return ls;
      const m = typeof document !== 'undefined' ? document.cookie.match(/(?:^|; )token=([^;]+)/) : null;
      return m ? decodeURIComponent(m[1]) : null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    try {
      setToken(readToken());
      const raw = localStorage.getItem("auth");
      const auth = raw ? JSON.parse(raw) : null;
      setResortName(auth?.resortName || "");
      setUserEmail(auth?.email || "");
    } catch { }

    const onStorage = () => setToken(readToken());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!token) {
      setFeatures(null);
      return;
    }
    const load = async () => {
      try {
        const { data } = await api.get("/settings/features");
        setFeatures((data || null) as FeatureConfig | null);
      } catch {
        setFeatures(null);
      }
    };
    load();
  }, [token]);

  // Fetch availability of active accounts per package
  useEffect(() => {
    if (!token) return;
    const run = async () => {
      try {
        const { data } = await api.get("/orders/availability"); setAvailability(data as any);
      } catch { }
    };
    run();
  }, [API_BASE, token]);
  // Load running rentals from localStorage
  useEffect(() => {
    try {
      const raw = localStorage.getItem('runningRentals');
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRunning(parsed.map((item: any) => normalizeRental(item)));
        }
      }
    } catch { }
    setLoadedLocal(true);
  }, []);
  // Persist running rentals (skip initial mount until local loaded)
  useEffect(() => {
    if (!loadedLocal) return;
    try { localStorage.setItem('runningRentals', JSON.stringify(running)); } catch { }
  }, [running, loadedLocal]);
  // Load running rentals from server when logged in
  useEffect(() => {
    const loadServer = async () => {
      if (!token) return;
      try {
        const { data } = await api.get('/rentals/list');
        if (Array.isArray(data)) {
          const serverNormalized = (data as any[]).map((item) => normalizeRental(item));
          setRunning((prev) => {
            const clientOnly = prev.filter((r: any) => String(r.id || '').startsWith('RUN-'));
            const dedupClient = clientOnly.filter((item) => !serverNormalized.some((srv) => srv.id === item.id));
            return [...serverNormalized, ...dedupClient];
          });
        }
      } catch { }
    };
    loadServer();
  }, [token]);
  // Timer tick
  useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    if (!payConfirmOpen) setSelectedPayment(null);
  }, [payConfirmOpen]);
  useEffect(() => {
    if (selectedPayment && !availablePayments.includes(selectedPayment)) {
      setSelectedPayment(null);
    }
  }, [availablePayments, selectedPayment]);
  const canOrder = (id: Pkg["id"]) => {
    if (!hasAnyPayment) return false;
    if (features && features.packages && features.packages[id] === false) return false;
    if (availability?.enabled && availability.enabled[id] === false) return false;
    if (!availability) return true; // optimistic until fetched
    return (availability[id] || 0) > 0;
  };



  const fmt = (n: number) => new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const getRentalEmail = (r: RunningRental) => {
    const primary = typeof r.email === 'string' ? r.email.trim() : '';
    if (primary) return primary;
    const fallback = typeof r.credentialEmail === 'string' ? r.credentialEmail.trim() : '';
    return fallback || '-';
  };

  const onDetail = (p: Pkg) => {
    setDetailFor(p);
  };

  const onOrder = (p: Pkg) => {
    if (!hasAnyPayment) {
      setResultMsg('No payment methods are active. Please contact the super admin to enable them.');
      return;
    }
    setOrderFor(p);
    setGuestInfoOpen(true);
    setGuestName('');
    setRoomNumber('');
    setAgreeChecked(false);
  };

  const orderCash = async () => {
    if (!orderFor) return;
    if (!cashEnabled) {
      setConfirmCashOpen(false);
      setResultMsg('Cash payment is disabled by super admin.');
      return;
    }
    setConfirmCashOpen(false);
    setAgreeChecked(false);
    setProcessing(true);
    try {
      const { data } = await api.post("/orders/cash", {
        pkg: orderFor.id,
        packageName: orderFor.title,
        price: orderFor.price,
        duration: orderFor.unit,
        resortName: resortName || "",
        guestName,
        roomNumber,
      });
      if (!data || (data as any)?.error) {
        setResultMsg(((data as any)?.error) || "Failed to record cash order.");
      } else {
        const c = (data as any)?.credential;
        if (c?.email && c?.password) {
          setCred({ email: c.email, password: c.password });
          // Create server-side rental (or use rental returned by /orders/cash)
          try {
            const rent = (data as any)?.rental;
            if (rent && rent.id) {
              const rentalWithEmail = { ...rent, email: c?.email || "" };
              setRunning((prev) => ([...prev, normalizeRental(rentalWithEmail)]));
              setResultMsg('Rental started. Credentials ready.');
              return;
            }
            const { data: r } = await api.post('/rentals/start', {
              pkg: orderFor.id,
              packageName: orderFor.title,
              price: orderFor.price,
              duration: orderFor.unit,
              guestName,
              roomNumber,
              resortName: resortName || undefined,
              credentialEmail: c?.email || undefined,
              credentialPassword: c?.password || undefined,
            });
            if (r && r.id) {
              setRunning((prev) => ([...prev, normalizeRental(r)]));
              setResultMsg('Rental started. Credentials ready.');
            } else {
              setResultMsg('Rental start did not return an id. Please check backend.');
              throw new Error('no_rental');
            }
          } catch (e: any) {
            // fallback to local so UI shows immediately, and inform user
            const baseMinutes = orderFor.id === '1h' ? 60 : orderFor.id === '3h' ? 180 : 1440;
            setRunning((prev) => ([
              ...prev,
              normalizeRental({
                id: `RUN-${Date.now()}`,
                guestName: guestName || 'Guest',
                roomNumber: roomNumber || '-',
                pkg: orderFor.id,
                packageName: orderFor.title,
                basePrice: orderFor.price,
                baseMinutes,
                startedAt: Date.now(),
                status: 'active',
                email: c?.email || ''
              })
            ]));
            setResultMsg('Rental started locally (server start failed). Please verify backend /rentals/start.');
          }
        } else {
          setResultMsg("Order recorded. Credentials will be sent via email.");
        }
      }
    } catch {
      setResultMsg("Failed to record cash order.");
    } finally {
      setProcessing(false);
    }
  };

  // Online payment is now only triggered from Pay Now on unpaid rows

  // Pay button for unpaid rentals
  function PayUnpaidBtn({ rental, onOpen }: { rental: any; onOpen: (r: any) => void }) {
    if (!hasAnyPayment) {
      return (
        <span className="inline-flex items-center rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-500">Payment method disabled</span>
      );
    }
    return (
      <button
        onClick={() => onOpen(rental)}
        className="rounded-lg bg-rose-600 px-3 py-2 text-xs font-medium text-white hover:bg-rose-700"
      >
        Pay
      </button>
    );
  }

  const handleConfirmPayment = async (method: PaymentOption, totalAmount: number) => {
    if (!payTarget) return;
    const target = payTarget;
    if (method === 'cash') {
      try {
        setPayBusy(true);
        const payload = { rentalId: target.id, orderId: makeOrderId('CASH', target.id), paymentType: 'cash' };
        const res = await api.post('/rentals/settle', payload);
        if (res?.status >= 200 && res?.status < 300) {
          setRunning((prev) => prev.filter((x) => x.id !== target.id));
          setResultMsg('Cash payment recorded.\n\nThank you � the resort receptionist has been notified about this cash payment.');
          setPayConfirmOpen(false);
          setPayTarget(null);
          setSelectedPayment(null);
        } else {
          setResultMsg('Failed to mark cash payment.');
        }
      } catch (err: any) {
        console.error('cash settle error', err);
        const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || 'Unknown error';
        setResultMsg('Failed to mark cash payment.');
      } finally {
        setPayBusy(false);
      }
      return;
    }

    try {
      setPayBusy(true);
      const orderId = makeOrderId('RENT', target.id);
      const amount = Number(target.amountDue ?? totalAmount ?? 0);
      const mode = method === 'midtransProduction' ? 'production' : 'sandbox';
      const resp = await api.post('/payments/snap-token', {
        orderId,
        grossAmount: amount,
        itemName: `Extra Charge ${target.packageName}`,
        customer: { firstName: resortName || 'Resort', email: userEmail || '' },
        mode,
      });
      const token = resp?.data?.token;
      if (!token) {
        const detailSource = resp?.data?.error || resp?.data?.detail || resp?.data;
        const detailText = detailSource ? (typeof detailSource === 'string' ? detailSource : JSON.stringify(detailSource)) : '';
        setResultMsg(detailText ? `Failed to start online payment. Detail: ${detailText}` : 'Failed to start online payment.');
        return;
      }
      const paymentMode: OnlinePaymentOption = mode === 'production' ? 'midtransProduction' : 'midtransSandbox';
      setPayConfirmOpen(false);
      setPayTarget(null);
      setSelectedPayment(null);
      setSnapContext({ mode: 'extras', rentalId: target.id, amount, paymentMode });
      setSnapToken(token);
      setSnapOpen(true);
    } catch (err: any) {
      console.error('snap-token error', err);
      const detail = err?.response?.data ? JSON.stringify(err.response.data) : err?.message || 'Unknown error';
      const message = err?.response?.data?.error || err?.message;
      setResultMsg(`Failed to start online payment${message ? `: ${message}` : '.'}`);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl bg-gradient-to-tr from-sky-50 to-emerald-50 p-[1px] shadow-sm">
        <div className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5M21 12A9 9 0 1 1 3 12a9 9 0 0 1 18 0Z" /></svg>
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Dashboard</h1>
              <p className="text-sm text-slate-600">Choose a package and complete checkout with cash or online payment.</p>
            </div>
          </div>
        </div>
      </section>


      {features && !hasAnyPayment && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          All payment methods are disabled. Please contact the super admin.
        </div>
      )}

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {packages.length === 0 ? (
          <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-600">
            All packages are disabled by the super admin.
          </div>
        ) : packages.map((p) => {
          const orderEnabled = canOrder(p.id);
          const disabledReason = !hasAnyPayment
            ? 'Payment method disabled'
            : features && features.packages && features.packages[p.id] === false
              ? 'Disabled by super admin'
              : 'Unavailable: no active account';
          return (
            <article key={p.id} className="group rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200 transition hover:shadow-md hover:-translate-y-0.5">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{p.title}</h2>
                  <p className="mt-1 text-sm text-slate-600">{p.desc}</p>
                </div>
                <div className="h-10 w-10 grid place-items-center rounded-xl bg-sky-50 text-sky-700 ring-1 ring-sky-100">
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-5 w-5"><path strokeLinecap="round" strokeLinejoin="round" d="M9 19.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12 0a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM9 19.5l3-9h4.5m0 0L18 6h-3m1.5 4.5 3 3" /></svg>
                </div>
              </div>
              <div className="mt-4 flex items-baseline gap-2">
                <div className="text-2xl font-bold text-slate-900">{fmt(p.price)}</div>
                <div className="text-sm text-slate-500">/ {p.unit}</div>
              </div>
              <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> price includes 11%VAT and 10% service charge
              </div>
              <div className="mt-6 flex gap-3">
                <button onClick={() => onDetail(p)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Detail</button>
                <button
                  onClick={() => onOrder(p)}
                  disabled={!orderEnabled}
                  className={orderEnabled
                    ? "h-11 flex-1 rounded-xl px-4 text-sm font-medium shadow-sm transition bg-sky-500 text-white hover:bg-sky-600"
                    : "h-11 flex-1 rounded-xl px-4 text-sm font-medium shadow-sm transition bg-slate-200 text-slate-500 cursor-not-allowed"
                  }
                  title={orderEnabled ? "Order" : disabledReason}
                >
                  {orderEnabled ? 'Order' : disabledReason}
                </button>
              </div>
            </article>
          );
        })}
      </section>

      {resultMsg && (
        <div className="rounded-xl bg-emerald-50 px-4 py-3 text-emerald-800 ring-1 ring-emerald-200">{resultMsg}</div>
      )}

      {/* Detail modal */}
      {detailFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setDetailFor(null)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">{detailFor.title}</h3>
            <p className="mt-2 text-sm text-slate-600">{detailFor.desc}</p>

            <div className="mt-4 rounded-xl bg-slate-50/70 p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-800">What you get</div>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                <li>{fmt(detailFor.price)} Reflow balance to kickstart your rides</li>
              </ul>
            </div>

            <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
              <div className="text-sm font-semibold text-slate-800">Friendly terms</div>
              <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-slate-700">
                <li>An internet connection is needed to enjoy the app.</li>
                <li>Please download and install the Reflow app to unlock and ride your bike.</li>
                <li>Your rental time begins once your Reflow account is activated.</li>
                <li>
                  If you go beyond your rental period, an extra {fmt(extras.rate)} will be added
                  for each additional {extras.block} minutes (after {extras.grace} minutes grace).
                </li>

                <li>Your rental and ride history are safely stored in our system for your convenience.</li>
              </ol>
            </div>


            <div className="mt-4 text-slate-700">Price: <span className="font-semibold">{fmt(detailFor.price)}</span> / {detailFor.unit}</div>
            <div className="mt-6 flex gap-3">
              <button onClick={() => setDetailFor(null)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Close</button>
              <button onClick={() => { setDetailFor(null); onOrder(detailFor); }} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Order</button>
            </div>
          </div>
        </div>
      )}

      {/* Guest info modal */}
      {orderFor && guestInfoOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setGuestInfoOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Guest Information</h3>
            <p className="mt-1 text-sm text-slate-600">Please input guest name and room number for this order.</p>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Guest Name</label>
                <input value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="e.g. John Doe" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:border-sky-500 focus:ring-sky-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Room Number</label>
                <input value={roomNumber} onChange={(e) => setRoomNumber(e.target.value)} placeholder="e.g. 203" className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm outline-none ring-1 ring-slate-200 focus:border-sky-500 focus:ring-sky-100" />
              </div>
            </div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setGuestInfoOpen(false)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cancel</button>
              <button onClick={() => { if (!guestName.trim() || !roomNumber.trim() || !cashEnabled) return; setGuestInfoOpen(false); setConfirmCashOpen(true); }} disabled={!guestName.trim() || !roomNumber.trim() || !cashEnabled} title={!cashEnabled ? 'Cash payment disabled' : undefined} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">Continue</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm Cash modal */}
      {orderFor && confirmCashOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmCashOpen(false)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">Start Rental</h3>
            <p className="mt-2 text-sm text-slate-600">Please confirm to start rental for {orderFor.title} ({fmt(orderFor.price)}).</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-xs text-slate-700 ring-1 ring-slate-200">
              Guest: <span className="font-medium text-slate-900">{guestName}</span> • Room: <span className="font-medium text-slate-900">{roomNumber}</span>
            </div>
            <label className="mt-4 flex items-start gap-3 text-sm text-slate-700">
              <input type="checkbox" checked={agreeChecked} onChange={(e) => setAgreeChecked(e.target.checked)} className="mt-1 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500" />
              <span>
                I agree to the <button onClick={() => setOpenAgreement(true)} className="text-sky-700 underline">User Agreement</button> and <button onClick={() => setOpenPrivacy(true)} className="text-sky-700 underline">Privacy Policy</button>.
              </span>
            </label>
            <div className="mt-5 flex gap-3">
              <button onClick={orderCash} disabled={!agreeChecked || !cashEnabled} title={!cashEnabled ? 'Cash payment disabled' : undefined} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition enabled:hover:bg-sky-700 disabled:opacity-50">Yes, start</button>
              <button onClick={() => setConfirmCashOpen(false)} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">Cancel</button>
            </div>
          </div>
        </div>
      )}



      {/* Legal modals */}
      {(openPrivacy || openAgreement) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setOpenPrivacy(false); setOpenAgreement(false); }} />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">{openPrivacy ? 'Privacy Policy' : 'User Agreement'}</h3>
            <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
              <p>Thank you for using the Re:Flow service. This document explains {openPrivacy ? 'how we collect, use, and protect your personal data.' : 'the terms and conditions for using our service, including your responsibilities while renting and operating the devices.'}</p>
              <p>Key reminder: the data you submit (guest name and room number) is used for identification, billing, and the resort's operational records.</p>
              <p>For the complete document, please contact the administrator or visit our official legal page.</p>
            </div>
            <div className="mt-5 flex justify-end">
              <button onClick={() => { setOpenPrivacy(false); setOpenAgreement(false); }} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Running rentals */}
      <section className="rounded-2xl bg-white/90 p-5 ring-1 ring-slate-200 shadow-sm">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9" /></svg>
            </div>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Running Rentals</h2>
              <p className="text-xs text-slate-600">Active and unpaid rentals appear here. Unpaid rows are highlighted.</p>
            </div>
          </div>
        </div>
        <div className="overflow-x-auto rounded-xl ring-1 ring-slate-200">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600">
              <tr>
                <th className="px-3 py-2 font-medium">Guest</th>
                <th className="px-3 py-2 font-medium">Room</th>
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Package</th>
                <th className="px-3 py-2 font-medium">Start</th>
                <th className="px-3 py-2 font-medium">Rental time</th>
                <th className="px-3 py-2 font-medium">Charge</th>
                <th className="px-3 py-2 font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {running.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-4 text-center text-slate-500">No running rentals.</td></tr>
              ) : (
                running.map((r) => {
                  const base = r.baseMinutes;
                  const end = r.endedAt || Date.now();
                  const elapsedSec = Math.max(0, Math.floor((end - r.startedAt) / 1000));
                  const elapsedMin = Math.max(0, Math.ceil((end - r.startedAt) / 60000));
                  const extraMinutes = Math.max(0, elapsedMin - base);
                  const chargeableMinutes = Math.max(0, extraMinutes - extras.grace);
                  const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / extras.block));
                  const extraCost = extraBlocks * extras.rate;
                  const charge = r.status === 'active' ? r.basePrice + extraCost : (r.amountDue ?? (r.basePrice + extraCost));
                  const hours = Math.floor(elapsedSec / 3600);
                  const minutes = Math.floor((elapsedSec % 3600) / 60);
                  const seconds = elapsedSec % 60;
                  const startedStr = new Date(r.startedAt).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
                  const rowClass = r.status === 'unpaid' ? 'bg-rose-50' : '';
                  return (
                    <tr key={r.id} className={`border-t border-slate-100 ${rowClass}`}>
                      <td className="px-3 py-2 text-slate-800">{r.guestName}</td>
                      <td className="px-3 py-2 text-slate-800">{r.roomNumber}</td>
                      <td className="px-3 py-2 text-slate-800">{getRentalEmail(r)}</td>
                      <td className="px-3 py-2 text-slate-800">{r.packageName}</td>
                      <td className="px-3 py-2 text-slate-700">{startedStr}</td>
                      <td className="px-3 py-2 text-slate-700">{String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}</td>
                      <td className="px-3 py-2 font-semibold text-slate-900">{fmt(charge)}</td>
                      <td className="px-3 py-2">
                        {r.status === 'active' ? (
                          <button
                            onClick={() => { setEndTarget(r); setEndConfirmOpen(true); }}
                            className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-medium text-white hover:bg-amber-600"
                          >End Rental</button>
                        ) : (
                          <PayUnpaidBtn rental={r} onOpen={(rt) => { setSelectedPayment(null); setPayTarget(rt); setPayConfirmOpen(true); }} />
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Midtrans Snap popup */}
      {snapOpen && snapToken && (
        <MidtransPopup
          token={snapToken}
          mode={snapContext?.paymentMode === 'midtransProduction' ? 'production' : 'sandbox'}
          onSuccess={async (res: any) => {
            try {
              if (snapContext?.rentalId) {
                try {
                  await api.post('/rentals/settle', {
                    rentalId: snapContext.rentalId,
                    orderId: res?.order_id,
                    paymentType: snapContext?.paymentMode || res?.payment_type,
                  });
                } catch { }
                setRunning((prev) => prev.filter((x) => x.id !== snapContext.rentalId));
              }
              setResultMsg('Payment successful. Thank you for using our rental service.');
            } finally {
              setSnapOpen(false);
              setSnapToken(null);
              setSnapContext(null);
            }
          }}
          onPending={(res: any) => { setResultMsg('Payment is pending confirmation from Midtrans.'); setSnapOpen(false); setSnapToken(null); setSnapContext(null); }}
          onError={(err: any) => { setResultMsg('Payment failed. Please try again.'); setSnapOpen(false); setSnapToken(null); setSnapContext(null); }}
          onClose={() => { setResultMsg('Payment window closed before completion.'); setSnapOpen(false); setSnapToken(null); setSnapContext(null); }}
        />
      )}

      {/* End rental confirmation */}
      {endConfirmOpen && endTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setEndConfirmOpen(false); setEndTarget(null); }} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">End Rental?</h3>
            <p className="mt-2 text-sm text-slate-600">Are you sure you want to end this rental now?</p>
            <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm ring-1 ring-slate-200">
              <div className="flex items-center justify-between"><span className="text-slate-600">Guest</span><span className="font-medium text-slate-900">{endTarget.guestName}</span></div>
              <div className="mt-1 flex items-center justify-between"><span className="text-slate-600">Room</span><span className="font-medium text-slate-900">{endTarget.roomNumber}</span></div>
              <div className="mt-1 flex items-center justify-between"><span className="text-slate-600">Package</span><span className="font-medium text-slate-900">{endTarget.packageName}</span></div>
            </div>
            <div className="mt-5 flex gap-3">
              <button
                onClick={async () => {
                  // Immediately reflect locally so UI always updates
                  const endAt = Date.now();
                  const elapsedM = Math.max(0, Math.ceil((endAt - endTarget.startedAt) / 60000));
                  const extraMinutes = Math.max(0, elapsedM - endTarget.baseMinutes);
                  const chargeableMinutes = Math.max(0, extraMinutes - extras.grace);
                  const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / extras.block));
                  const due = endTarget.basePrice + extraBlocks * extras.rate;

                  setRunning((prev) => prev.map((x) => x.id === endTarget.id ? { ...x, status: 'unpaid', endedAt: endAt, amountDue: due } : x));
                  setResultMsg('Rental ended. Please proceed to payment.');
                  // Try to persist to server (if logged in and server id)
                  try {
                    const isServerId = typeof endTarget.id === 'string' && !String(endTarget.id).startsWith('RUN-');
                    if (isServerId) {
                      await api.post('/rentals/end', { rentalId: endTarget.id });
                    }
                  } catch { }
                  setEndConfirmOpen(false);
                  setEndTarget(null);
                }}
                className="h-11 flex-1 rounded-xl bg-amber-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-amber-700"
              >Yes, end now</button>
              <button onClick={() => { setEndConfirmOpen(false); setEndTarget(null); }} className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50">No</button>
            </div>
          </div>
        </div>
      )}

      {/* Pay confirmation modal */}
      {payConfirmOpen && payTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => { if (!payBusy) { setPayConfirmOpen(false); setPayTarget(null); } }} />
          <div className="relative w-full max-w-lg max-h-[88vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-rose-50 text-rose-700 ring-1 ring-rose-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6l3 3M12 3a9 9 0 1 0 9 9" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Confirm Payment</h3>
            </div>
            {(() => {
              const start = payTarget.startedAt;
              const end = payTarget.endedAt || Date.now();
              const durationSec = Math.max(0, Math.floor((end - start) / 1000));
              const hh = String(Math.floor(durationSec / 3600)).padStart(2, '0');
              const mm = String(Math.floor((durationSec % 3600) / 60)).padStart(2, '0');
              const ss = String(durationSec % 60).padStart(2, '0');
              const durationMin = Math.max(0, Math.ceil((end - start) / 60000));
              const extraMinutes = Math.max(0, durationMin - payTarget.baseMinutes);
              const chargeableMinutes = Math.max(0, extraMinutes - extras.grace);
              const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / extras.block));
              const extrasCost = extraBlocks * extras.rate;
              const total = payTarget.amountDue ?? (payTarget.basePrice + extrasCost);
              const startStr = new Date(start).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              const endStr = new Date(end).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
              return (
                <div>
                  <div className="grid gap-2 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Guest</span>
                      <span className="font-medium text-slate-900">{payTarget.guestName}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Room</span>
                      <span className="font-medium text-slate-900">{payTarget.roomNumber}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Package</span>
                      <span className="font-medium text-slate-900">{payTarget.packageName}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Start time</span>
                      <span className="font-medium text-slate-900">{startStr}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">End time</span>
                      <span className="font-medium text-slate-900">{endStr}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Rental duration</span>
                      <span className="font-medium text-slate-900">{hh}:{mm}:{ss}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-600">Extra time</span>
                      <span className="font-medium text-slate-900">{extraMinutes} min total / charge {extraBlocks} x 60 min</span>
                    </div>
                  </div>
                  <div className="mt-4 rounded-xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="text-sm font-semibold text-slate-800">Payment Breakdown</div>
                    <div className="mt-2 space-y-1 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">Package</span>
                        <span className="font-medium text-slate-900">{fmt(payTarget.basePrice)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-slate-600">
                          Extra time (tolerance {extras.grace} min)
                          {extraBlocks > 0 && (
                            <span className="text-slate-500"> - {extraBlocks} x 60 min</span>
                          )}
                        </span>
                        <span className="font-medium text-slate-900">{fmt(extrasCost)}</span>
                      </div>
                      <div className="my-2 h-px bg-slate-200" />
                      <div className="flex items-center justify-between text-base">
                        <span className="font-semibold text-slate-900">Total</span>
                        <span className="font-semibold text-slate-900">{fmt(total)}</span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-5">
                    <div className="text-sm font-semibold text-slate-800">Choose Payment Method</div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {availablePayments.map((method) => (
                        <button
                          key={method}
                          type="button"
                          disabled={payBusy}
                          onClick={() => setSelectedPayment(method)}
                          className={`rounded-xl border px-4 py-2 text-xs font-semibold transition ${selectedPayment === method
                            ? 'border-rose-500 bg-rose-50 text-rose-600'
                            : 'border-slate-200 bg-white text-slate-700 hover:border-rose-300 hover:text-rose-600'
                            }`}
                        >
                          {PAYMENT_LABELS[method]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {selectedPayment && (
                    <div className="mt-5 space-y-4">
                      <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-700 ring-1 ring-slate-200">
                        {PAYMENT_CONFIRM_COPY[selectedPayment]}
                      </div>
                      <div className="flex gap-3">
                        <button
                          type="button"
                          disabled={payBusy}
                          onClick={() => handleConfirmPayment(selectedPayment, total)}
                          className="h-11 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                        >
                          {payBusy ? 'Processing...' : 'Yes, proceed'}
                        </button>
                        <button
                          type="button"
                          disabled={payBusy}
                          onClick={() => setSelectedPayment(null)}
                          className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          Change method
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
                      type="button"
                      disabled={payBusy}
                      onClick={() => { if (!payBusy) { setPayConfirmOpen(false); setPayTarget(null); } }}
                      className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* Credential modal */}
      {cred && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCred(null)} />
          <div className="relative w-full max-w-md max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <div className="mb-3 flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="h-4 w-4"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" /></svg>
              </div>
              <h3 className="text-lg font-semibold text-slate-900">Credentials Ready</h3>
            </div>
            <p className="text-sm text-slate-600">Use these credentials to sign in on the Re:Flow app and start your ride.</p>
            <div className="mt-4 space-y-3">
              <label className="block text-xs font-medium text-slate-600">Email</label>
              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm ring-1 ring-slate-200">
                <span className="truncate pr-3 font-mono text-slate-900">{cred.email}</span>
                <button onClick={() => navigator.clipboard.writeText(cred.email)} className="rounded-lg border px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">Copy</button>
              </div>
              <label className="mt-2 block text-xs font-medium text-slate-600">Password</label>
              <div className="flex items-center justify-between rounded-xl border border-slate-300 bg-white px-3 py-3 text-sm ring-1 ring-slate-200">
                <span className="truncate pr-3 font-mono text-slate-900">{cred.password}</span>
                <button onClick={() => navigator.clipboard.writeText(cred.password)} className="rounded-lg border px-2 py-1 text-xs font-medium text-slate-800 hover:bg-slate-50">Copy</button>
              </div>
            </div>
            <div className="mt-4 rounded-lg bg-sky-50 p-3 text-xs text-sky-800 ring-1 ring-sky-200">
              Open the Re:Flow mobile app, tap Sign In, and paste the email & password above. You can change the password later in the app.
            </div>
            <div className="mt-5 text-xs text-slate-500">We also send these credentials to your registered contact email for convenience.</div>
            <div className="mt-5 flex gap-3">
              <button onClick={() => setCred(null)} className="h-11 flex-1 rounded-xl bg-sky-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-sky-700">Done</button>
            </div>
          </div>
        </div>
      )}

      {processing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/20">
          <div className="rounded-xl bg-white px-6 py-4 shadow ring-1 ring-slate-200">
            <div className="flex items-center gap-3 text-sm text-slate-700"><span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-sky-600" /> Processing...</div>
          </div>
        </div>
      )}
      {!token && (
        <div className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-amber-800 ring-1 ring-amber-200">
          You are not signed in. Please log in to place orders.
        </div>
      )}
    </div>
  );
}
