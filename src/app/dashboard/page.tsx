"use client";

import { useEffect, useMemo, useState } from "react";
import MidtransPopup from "@/app/components/midtrans.popup";
import { api } from "@/app/lib/api";

type Pkg = { id: "1h" | "3h" | "1d"; title: string; desc: string; price: number; unit: string };

type FeatureConfig = {
  packages: { '1h': boolean; '3h': boolean; '1d': boolean };
  payments: { cash: boolean; midtransSandbox: boolean; midtransProduction: boolean };
};

type PaymentOption = 'cash' | 'midtransSandbox' | 'midtransProduction';
type OnlinePaymentOption = Exclude<PaymentOption, 'cash'>;

// ----------------------
// Move type BEFORE usage
// ----------------------
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
};

const PAYMENT_LABELS: Record<PaymentOption, string> = {
  cash: 'Cash',
  midtransSandbox: 'Online Payment (Midtrans Sandbox)',
  midtransProduction: 'Online Payment (Midtrans Production)',
};

const PAYMENT_CONFIRM_COPY: Record<PaymentOption, string> = {
  cash: 'Process cash payment now? This will be recorded in the system.',
  midtransSandbox: 'Process online payment via Midtrans Sandbox now?',
  midtransProduction: 'Process online payment via Midtrans Production now?',
};

const EXTRA_HOURLY_RATE = 50_000;
const EXTRA_BLOCK_MINUTES = 60;
const EXTRA_GRACE_MINUTES = 5;

// Fix server/client date formatting by pinning the time zone:
const LOCALE = "id-ID";
const TZ_OPTS: Intl.DateTimeFormatOptions = { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Makassar" };

export default function DashboardPage() {
  // -------- Stable packages ----------
  const basePackages = useMemo<Pkg[]>(
    () => [
      { id: "1h", title: "1 Hour", desc: "Perfect for short city rides.", price: 50000, unit: "hour" },
      { id: "3h", title: "3 Hours", desc: "Explore more with extra time.", price: 100000, unit: "3 hours" },
      { id: "1d", title: "1 Day", desc: "Full day adventure on e-bike.", price: 200000, unit: "day" },
    ],
    []
  );

  const [features, setFeatures] = useState<FeatureConfig | null>(null);
  const [featuresLoading, setFeaturesLoading] = useState(false);

  const packages = useMemo(() => {
    if (!features) return basePackages;
    return basePackages.filter((pkg) => features.packages?.[pkg.id] !== false);
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

  // -------- UI states ----------
  const [detailFor, setDetailFor] = useState<Pkg | null>(null);
  const [orderFor, setOrderFor] = useState<Pkg | null>(null);
  const [guestInfoOpen, setGuestInfoOpen] = useState(false);
  const [guestName, setGuestName] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [confirmCashOpen, setConfirmCashOpen] = useState(false);
  const [agreeChecked, setAgreeChecked] = useState(false);
  const [openPrivacy, setOpenPrivacy] = useState(false);
  const [openAgreement, setOpenAgreement] = useState(false);
  const [snapToken, setSnapToken] = useState<string | null>(null);
  const [snapOpen, setSnapOpen] = useState(false);
  const [snapContext, setSnapContext] = useState<{ mode: 'extras'; rentalId?: string; amount?: number; paymentMode?: OnlinePaymentOption } | null>(null);
  const [processing, setProcessing] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [cred, setCred] = useState<{ email: string; password: string } | null>(null);
  const [availability, setAvailability] = useState<{ '1h': number; '3h': number; '1d': number; enabled?: Record<'1h' | '3h' | '1d', boolean> } | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [endTarget, setEndTarget] = useState<RunningRental | null>(null);
  const [payConfirmOpen, setPayConfirmOpen] = useState(false);
  const [payTarget, setPayTarget] = useState<RunningRental | null>(null);
  const [payBusy, setPayBusy] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<PaymentOption | null>(null);
  const [running, setRunning] = useState<RunningRental[]>([]);

  // -------- API base (kept stable) ----------
  const API_BASE = useMemo(() => {
    const env = (process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL);
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  // -------- Auth info ----------
  const [token, setToken] = useState<string | null>(null);
  const [resortName, setResortName] = useState<string>("");
  const [userEmail, setUserEmail] = useState<string>("");

  // -------- Client-only mounted clock to avoid hydration mismatch ----------
  const [mounted, setMounted] = useState(false);
  const [nowMs, setNowMs] = useState<number | null>(null);

  useEffect(() => {
    setMounted(true);
    setNowMs(Date.now());
    const id = setInterval(() => setNowMs((t) => (t ? t + 1000 : Date.now())), 1000);
    return () => clearInterval(id);
  }, []);

  // -------- Token helpers ----------
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
    } catch { /**/ }

    const onStorage = () => setToken(readToken());
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // -------- Features ----------
  useEffect(() => {
    if (!token) {
      setFeatures(null);
      return;
    }
    const load = async () => {
      setFeaturesLoading(true);
      try {
        const { data } = await api.get("/settings/features");
        setFeatures((data || null) as FeatureConfig | null);
      } catch {
        setFeatures(null);
      } finally {
        setFeaturesLoading(false);
      }
    };
    load();
  }, [token]);

  // -------- Availability ----------
  useEffect(() => {
    if (!token) return;
    const run = async () => {
      try {
        const { data } = await api.get("/orders/availability");
        setAvailability(data as any);
      } catch { /**/ }
    };
    run();
  }, [API_BASE, token]);

  // -------- Running rentals: local load/save ----------
  const [loadedLocal, setLoadedLocal] = useState(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem('runningRentals');
      if (raw) setRunning(JSON.parse(raw));
    } catch { /**/ }
    setLoadedLocal(true);
  }, []);
  useEffect(() => {
    if (!loadedLocal) return;
    try { localStorage.setItem('runningRentals', JSON.stringify(running)); } catch { /**/ }
  }, [running, loadedLocal]);

  // -------- Load server rentals ----------
  useEffect(() => {
    const loadServer = async () => {
      if (!token) return;
      try {
        const { data } = await api.get('/rentals/list');
        if (Array.isArray(data)) {
          setRunning((prev) => {
            const clientOnly = prev.filter((r: any) => String(r.id || '').startsWith('RUN-'));
            return [...(data as any[]), ...clientOnly];
          });
        }
      } catch { /**/ }
    };
    loadServer();
  }, [token]);

  // -------- Payment method selection sync ----------
  useEffect(() => {
    if (!payConfirmOpen) setSelectedPayment(null);
  }, [payConfirmOpen]);
  useEffect(() => {
    if (selectedPayment && !availablePayments.includes(selectedPayment)) {
      setSelectedPayment(null);
    }
  }, [availablePayments, selectedPayment]);

  // -------- Helpers ----------
  const canOrder = (id: Pkg["id"]) => {
    if (!hasAnyPayment) return false;
    if (features && features.packages && features.packages[id] === false) return false;
    if (availability?.enabled && availability.enabled[id] === false) return false;
    if (!availability) return true; // optimistic until fetched
    return (availability[id] || 0) > 0;
  };

  const fmt = (n: number) =>
    new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 }).format(n);

  const onDetail = (p: Pkg) => setDetailFor(p);

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
          try {
            const rent = (data as any)?.rental;
            if (rent && rent.id) {
              setRunning((prev) => ([...prev, rent]));
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
            });
            if (r && r.id) {
              setRunning((prev) => ([...prev, r]));
              setResultMsg('Rental started. Credentials ready.');
            } else {
              setResultMsg('Rental start did not return an id. Please check backend.');
              throw new Error('no_rental');
            }
          } catch {
            const baseMinutes = orderFor.id === '1h' ? 60 : orderFor.id === '3h' ? 180 : 1440;
            setRunning((prev) => ([
              ...prev,
              {
                id: `RUN-${Date.now()}`, // this is fine as it’s not rendered until mounted
                guestName: guestName || 'Guest',
                roomNumber: roomNumber || '-',
                pkg: orderFor.id,
                packageName: orderFor.title,
                basePrice: orderFor.price,
                baseMinutes,
                startedAt: Date.now(),
                status: 'active'
              } as RunningRental,
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

  // -------- Pay button --------
  function PayUnpaidBtn({ rental, onOpen }: { rental: RunningRental; onOpen: (r: RunningRental) => void }) {
    if (!hasAnyPayment) {
      return (
        <span className="inline-flex items-center rounded-lg bg-slate-200 px-3 py-2 text-xs font-medium text-slate-500">
          Payment method disabled
        </span>
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

  // -------- Legal content (static) --------
  function AgreementContent() {
    return (
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">
        <p>
          Welcome to Re:Flow! By using our service, you agree to ride safely, follow local
          rules, and treat the bike with care. If something looks off, please report it to
          the resort or our support team.
        </p>

        <h4 className="font-semibold text-slate-900">Friendly terms</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>An internet connection is needed to enjoy the app.</li>
          <li>Please download and install the Reflow app to unlock and ride your bike.</li>
          <li>Your rental time begins once your Reflow account is activated.</li>
          <li>
            If you go beyond your rental period, an extra <span className="font-medium">IDR 50,000</span> will be
            added automatically for each additional hour.
          </li>
          <li>Your rental and ride history are safely stored in our system for your convenience.</li>
        </ul>

        <h4 className="font-semibold text-slate-900">Usage & responsibilities</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Only the account holder may ride the bike unlocked with their account.</li>
          <li>Return the bike to an approved area and end the ride in the app to stop billing.</li>
          <li>You’re responsible for any damage or loss caused by misuse or negligence.</li>
          <li>Fees and charges are shown in the app before you ride; overtime is billed automatically per hour.</li>
        </ul>

        <h4 className="font-semibold text-slate-900">Payments & receipts</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Available payment options may include cash (via resort) or online payment.</li>
          <li>Receipts and history are available in the app and can be shared with the resort on request.</li>
        </ul>

        <p className="text-slate-600">
          Once you agree and proceed, your actions (e.g., unlocks, ride start/end, payments) are
          <span className="font-medium"> recorded in our system</span> for security, billing, and support.
        </p>
      </div>
    );
  }

  function PrivacyContent() {
    return (
      <div className="space-y-3 text-sm leading-relaxed text-slate-700">
        <p>
          We care about your privacy. We collect only the data needed to provide and improve
          your riding experience.
        </p>

        <h4 className="font-semibold text-slate-900">What we collect</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>Account details (e.g., name, email) to create and manage your account.</li>
          <li>Ride and rental information (start/end time, location zones, fees) to operate the service.</li>
          <li>
            Optional resort details (guest name, room number) to help with identification, billing, and
            resort operations.
          </li>
        </ul>

        <h4 className="font-semibold text-slate-900">How we use it</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>To unlock bikes, calculate time and fees (including overtime), and show your ride history.</li>
          <li>To provide support and resolve issues with your rentals or payments.</li>
          <li>To keep the service secure and prevent fraud or misuse.</li>
        </ul>

        <h4 className="font-semibold text-slate-900">How we protect it</h4>
        <ul className="list-disc pl-5 space-y-1">
          <li>We store data securely and limit access to authorized personnel only.</li>
          <li>We do not sell your personal data.</li>
          <li>
            We may share data with resort partners solely for check-in/out verification and billing support.
          </li>
        </ul>

        <p className="text-slate-600">
          You can request to view or delete your data as allowed by applicable laws. For the full privacy
          notice, please contact the administrator or visit our legal page.
        </p>
      </div>
    );
  }

  // -------- Payment handler --------
  const handleConfirmPayment = async (method: PaymentOption, totalAmount: number) => {
    if (!payTarget) return;
    const target = payTarget;
    if (method === 'cash') {
      try {
        setPayBusy(true);
        const payload = { rentalId: target.id, orderId: `CASH-${target.id}-${Date.now()}`, paymentType: 'cash' };
        const res = await api.post('/rentals/settle', payload);
        if (res?.status >= 200 && res?.status < 300) {
          setRunning((prev) => prev.filter((x) => x.id !== target.id));
          setResultMsg('Cash payment recorded. Thank you for using our rental service.');
          setPayConfirmOpen(false);
          setPayTarget(null);
          setSelectedPayment(null);
        } else {
          setResultMsg('Failed to mark cash payment.');
        }
      } catch {
        setResultMsg('Failed to mark cash payment.');
      } finally {
        setPayBusy(false);
      }
      return;
    }

    try {
      setPayBusy(true);
      const orderId = `RENTAL-${target.id}-${Date.now()}`;
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
        setResultMsg('Failed to start online payment.');
        return;
      }
      const paymentMode: OnlinePaymentOption = mode === 'production' ? 'midtransProduction' : 'midtransSandbox';
      setPayConfirmOpen(false);
      setPayTarget(null);
      setSelectedPayment(null);
      setSnapContext({ mode: 'extras', rentalId: target.id, amount, paymentMode });
      setSnapToken(token);
      setSnapOpen(true);
    } catch {
      setResultMsg('Failed to start online payment.');
    } finally {
      setPayBusy(false);
    }
  };

  // -------- Render ----------
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

      {!featuresLoading && features && !hasAnyPayment && (
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
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> Includes {fmt(p.price)} Reflow balance
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
                <li>If you go beyond your rental period, an extra IDR 50,000 will be added automatically for each additional hour.</li>
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
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Guest Name
                </label>
                <input
                  value={guestName}
                  onChange={(e) => setGuestName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full rounded-xl border border-slate-300 
               bg-white dark:bg-slate-800 
               px-3 py-2 text-sm 
               text-black dark:text-white
               placeholder-slate-400 dark:placeholder-slate-500
               outline-none ring-1 ring-slate-200 
               focus:border-sky-500 focus:ring-sky-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-300">
                  Room Number
                </label>
                <input
                  value={roomNumber}
                  onChange={(e) => setRoomNumber(e.target.value)}
                  placeholder="e.g. 203"
                  className="w-full rounded-xl border border-slate-300 
               bg-white dark:bg-slate-800 
               px-3 py-2 text-sm 
               text-black dark:text-white
               placeholder-slate-400 dark:placeholder-slate-500
               outline-none ring-1 ring-slate-200 
               focus:border-sky-500 focus:ring-sky-100"
                />
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
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => {
              setOpenPrivacy(false);
              setOpenAgreement(false);
            }}
          />
          <div className="relative w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200">
            <h3 className="text-lg font-semibold text-slate-900">
              {openPrivacy ? 'Privacy Policy' : 'User Agreement'}
            </h3>

            <div className="mt-3">
              {openPrivacy ? <PrivacyContent /> : <AgreementContent />}
            </div>

            <div className="mt-5 flex justify-end gap-2">
              <button
                onClick={() => {
                  setOpenPrivacy(false);
                  setOpenAgreement(false);
                }}
                className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
              >
                Close
              </button>
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
                  const chargeableMinutes = Math.max(0, extraMinutes - EXTRA_GRACE_MINUTES);
                  const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / EXTRA_BLOCK_MINUTES));
                  const extraCost = extraBlocks * EXTRA_HOURLY_RATE;
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
          onPending={() => { setResultMsg('Payment is pending confirmation from Midtrans.'); setSnapOpen(false); setSnapToken(null); setSnapContext(null); }}
          onError={() => { setResultMsg('Payment failed. Please try again.'); setSnapOpen(false); setSnapToken(null); setSnapContext(null); }}
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
                  const chargeableMinutes = Math.max(0, extraMinutes - EXTRA_GRACE_MINUTES);
                  const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / EXTRA_BLOCK_MINUTES));
                  const due = endTarget.basePrice + extraBlocks * EXTRA_HOURLY_RATE;
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
              const chargeableMinutes = Math.max(0, extraMinutes - EXTRA_GRACE_MINUTES);
              const extraBlocks = Math.max(0, Math.ceil(chargeableMinutes / EXTRA_BLOCK_MINUTES));
              const extrasCost = extraBlocks * EXTRA_HOURLY_RATE;
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
                          Extra time (tolerance {EXTRA_GRACE_MINUTES} min)
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
                          disabled={payBusy}
                          onClick={() => handleConfirmPayment(selectedPayment, total)}
                          className="h-11 flex-1 rounded-xl bg-rose-600 px-4 text-sm font-medium text-white shadow-sm transition hover:bg-rose-700 disabled:opacity-50"
                        >
                          {payBusy ? 'Processing...' : 'Yes, proceed'}
                        </button>
                        <button
                          disabled={payBusy}
                          onClick={() => setSelectedPayment(null)}
                          className="h-11 flex-1 rounded-xl border border-slate-300 bg-white px-4 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50 disabled:opacity-50"
                        >
                          No
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="mt-6 flex justify-end">
                    <button
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





