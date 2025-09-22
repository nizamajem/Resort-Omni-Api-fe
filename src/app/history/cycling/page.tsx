"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

const MILE_TO_KM = 1.60934;
const CO2_PER_KM_KG = 0.21;
const CALORIES_PER_KM = 28;
const HISTORY_PAGE_SIZE = 5;
const AUTO_REFRESH_INTERVAL = 8000;

const numberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const integerFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
const dateFormatter = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short" });

type OmniLog = {
  ts: number;
  path: string;
  method?: string;
  ip?: string;
  src?: "mw" | "controller";
  query: any;
  headers: Record<string, any>;
  body: any;
};

type ParsedOmniLog = {
  imei?: string;
  instruction?: string;
  tokens?: string[];
  json: Record<string, unknown>;
  lockInstr?: number | null;
  horseshoe?: number | null;
  l0Status?: number | null;
  battery?: number | null;
  speed?: number | null;
  charging?: number | null;
  fault?: number | null;
  remain?: number | null;
  mileagePerRide?: number | null;
};

type OmniTelemetry = {
  estimatedRemainingCyclingMiles?: number | null;
  currentElectricQuantity?: number | null;
  currentSpeed?: number | null;
  faultInformation?: number | null;
  mileagePerRide?: number | null;
  currentMode?: number | null;
  chargingState?: number | null;
  totalMileageRidden?: number | null;
};

type DeviceState = {
  imei: string;
  status: "OPEN" | "CLOSED";
  openSince: number | null;
  lastTs: number;
  lastInstr?: string;
  lastChangeTs?: number;
  lastTelemetryTs?: number;
  telemetry?: OmniTelemetry;
};

type CyclingActivity = {
  id: string;
  status: "active" | "completed";
  startedAt?: number | null;
  endedAt?: number | null;
  imei?: string;
  guestName?: string;
  resortName?: string;
  roomNumber?: string;
  instruction?: string;
  source: "telemetry" | "rental";
  telemetry: OmniTelemetry;
  derived: {
    rideMiles: number;
    rideKm: number;
    co2Kg: number;
    calories: number;
  };
  raw?: any;
};

type NormalizeResult = {
  active: CyclingActivity[];
  history: CyclingActivity[];
};

type HistoryGroup = {
  key: string;
  primary: CyclingActivity;
  sessions: CyclingActivity[];
  totalDistanceKm: number;
  totalCo2Kg: number;
  totalCalories: number;
};
const asNumber = (value: unknown): number | null => {
  if (value === null || value === undefined) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const num = Number(value);
    if (Number.isFinite(num)) return num;
  }
  return null;
};

const safeParseJSON = (value: unknown): Record<string, unknown> => {
  if (!value) return {};
  if (typeof value === "object") return value as Record<string, unknown>;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object") return parsed as Record<string, unknown>;
    } catch (err) {
      console.warn("Failed to parse JSON payload", err);
    }
  }
  return {};
};

const formatTimestamp = (ts?: number | null) => (ts ? dateFormatter.format(new Date(ts)) : "-");

const diffLabel = (start?: number | null, end?: number | null) => {
  if (!start) return "-";
  const endValue = end ?? Date.now();
  const ms = Math.max(0, endValue - start);
  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours >= 24) return `${Math.floor(hours / 24)}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = Math.floor((ms % 60000) / 1000);
  if (totalMinutes > 0) return `${totalMinutes}m ${seconds}s`;
  return `${seconds}s`;
};

const batteryBarClass = (battery: number) => {
  if (battery >= 60) return "bg-emerald-500";
  if (battery >= 30) return "bg-amber-500";
  return "bg-rose-500";
};

const toSafePercentage = (value: number | null | undefined) => {
  if (value === null || value === undefined || Number.isNaN(value)) return null;
  return Math.max(0, Math.min(100, value));
};

const toKm = (miles: number | null | undefined) => {
  if (miles === null || miles === undefined) return 0;
  return miles * MILE_TO_KM;
};

const parseBinaryFlag = (value: unknown): number | null => {
  const num = asNumber(value);
  if (num === null || num === undefined) return null;
  if (num === 0) return 0;
  if (num === 1) return 1;
  return null;
};
const parseOmniLog = (log: OmniLog): ParsedOmniLog => {
  const body: any = log.body || {};
  const info: ParsedOmniLog = { json: {} };

  const normaliseInstruction = (val: unknown) => {
    if (typeof val === "string") {
      const cleaned = val.trim();
      if (cleaned.length) return cleaned.toUpperCase();
    }
    if (typeof val === "number") {
      return String(val).toUpperCase();
    }
    return undefined;
  };

  const initialInstr = normaliseInstruction(body.instruction);
  if (initialInstr) info.instruction = initialInstr;

  const json = safeParseJSON(body.json);
  info.json = json;

  const candidateImeis: unknown[] = [body.imei, body.deviceImei, (json as any)?.imei, (json as any)?.deviceImei];
  for (const candidate of candidateImeis) {
    if (typeof candidate === "string" && candidate.trim().length) {
      info.imei = candidate.trim();
      break;
    }
  }

  const dataStr: string | undefined = typeof body.data === "string" ? body.data : undefined;
  if (dataStr) {
    const csv = dataStr.replace(/^\*/, "").replace(/#$/, "").split(",");
    info.tokens = csv;
    const imeiToken = csv.find((token) => /^\d{11,17}$/.test(token));
    if (imeiToken) info.imei = imeiToken;
    if (!info.instruction) {
      const maybeInstr = csv.find((token) => /^([A-Z]\d+|[A-Z]{1,3})$/.test(token));
      if (maybeInstr) info.instruction = String(maybeInstr).toUpperCase();
    }
    if (info.instruction === "L0" || info.instruction === "LO") {
      const idx = csv.findIndex((token) => token && (/^L0$|^LO$/i).test(String(token)));
      if (idx >= 0) {
        if (csv[idx + 1] !== undefined) {
          const status = asNumber(csv[idx + 1]);
          if (status === 0 || status === 1) info.l0Status = status;
        }
      }
    }
  }

  if (!info.instruction) {
    const jsonInstr = normaliseInstruction((json as any)?.instruction);
    if (jsonInstr) info.instruction = jsonInstr;
  }

  const lockInstr = parseBinaryFlag((json as any)?.lockingInstruction ?? (json as any)?.lockInstruction ?? body.lockingInstruction);
  if (lockInstr !== null) info.lockInstr = lockInstr;

  const horseshoe = parseBinaryFlag((json as any)?.horseshoeLockLockStatus ?? (json as any)?.horseshoeLockStatus ?? body.horseshoeLockStatus);
  if (horseshoe !== null) info.horseshoe = horseshoe;

  const battery = asNumber((json as any)?.currentElectricQuantity ?? (json as any)?.battery ?? body.currentElectricQuantity ?? body.battery);
  if (battery !== null) info.battery = battery;

  const speed = asNumber((json as any)?.currentSpeed ?? body.currentSpeed);
  if (speed !== null) info.speed = speed;

  const charging = parseBinaryFlag((json as any)?.chargingState ?? body.chargingState ?? body.charging);
  if (charging !== null) info.charging = charging;

  const fault = asNumber((json as any)?.faultInformation ?? body.faultInformation);
  if (fault !== null) info.fault = fault;

  const remain = asNumber((json as any)?.estimatedRemainingCyclingMiles ?? (json as any)?.estimatedRemainingMiles ?? body.estimatedRemainingCyclingMiles);
  if (remain !== null) info.remain = remain;

  const mileage = asNumber((json as any)?.mileagePerRide ?? (json as any)?.mileAgePerRide ?? body.mileagePerRide);
  if (mileage !== null) info.mileagePerRide = mileage;

  return info;
};

const deriveRideMetrics = (telemetry: OmniTelemetry) => {
  const rideMiles = telemetry.mileagePerRide ?? 0;
  const rideKm = toKm(rideMiles);
  const co2Kg = rideKm * CO2_PER_KM_KG;
  const calories = rideKm * CALORIES_PER_KM;
  return { rideMiles, rideKm, co2Kg, calories };
};

const mergeTelemetry = (base: OmniTelemetry | undefined, override?: OmniTelemetry | null): OmniTelemetry => {
  const original = base || {};
  const next = override || {};
  return {
    estimatedRemainingCyclingMiles: next.estimatedRemainingCyclingMiles ?? original.estimatedRemainingCyclingMiles ?? null,
    currentElectricQuantity: next.currentElectricQuantity ?? original.currentElectricQuantity ?? null,
    currentSpeed: next.currentSpeed ?? original.currentSpeed ?? null,
    faultInformation: next.faultInformation ?? original.faultInformation ?? null,
    mileagePerRide: next.mileagePerRide ?? original.mileagePerRide ?? null,
    currentMode: next.currentMode ?? original.currentMode ?? null,
    chargingState: next.chargingState ?? original.chargingState ?? null,
    totalMileageRidden: next.totalMileageRidden ?? original.totalMileageRidden ?? null,
  };
};

const telemetryFromParsedLog = (info: ParsedOmniLog): OmniTelemetry | null => {
  const jv = info.json || {};
  const telemetry: OmniTelemetry = {
    estimatedRemainingCyclingMiles: info.remain ?? asNumber((jv as any)?.estimatedRemainingCyclingMiles ?? (jv as any)?.estimatedRemainingMiles),
    currentElectricQuantity: info.battery ?? asNumber((jv as any)?.currentElectricQuantity ?? (jv as any)?.battery),
    currentSpeed: info.speed ?? asNumber((jv as any)?.currentSpeed),
    faultInformation: info.fault ?? asNumber((jv as any)?.faultInformation),
    mileagePerRide: info.mileagePerRide ?? asNumber((jv as any)?.mileagePerRide ?? (jv as any)?.mileAgePerRide),
    currentMode: asNumber((jv as any)?.currentMode ?? (jv as any)?.mode),
    chargingState: info.charging ?? asNumber((jv as any)?.chargingState),
    totalMileageRidden: asNumber((jv as any)?.totalMileageRidden ?? (jv as any)?.totalMileage),
  };
  const hasValue = Object.values(telemetry).some((value) => value !== null && value !== undefined);
  return hasValue ? telemetry : null;
};

const computeDeviceStatesFromLogs = (logs: OmniLog[]): DeviceState[] => {
  const states = new Map<string, DeviceState>();
  const ordered = logs.filter((log) => log && log.src === "controller").slice().reverse();
  const debounceMs = 1500;

  for (const log of ordered) {
    const omni = parseOmniLog(log);
    const imei = typeof omni.imei === "string" ? omni.imei.trim() : "";
    if (!imei) continue;

    const state = states.get(imei) || { imei, status: "CLOSED", openSince: null, lastTs: 0 };
    state.lastTs = log.ts;
    if (omni.instruction) state.lastInstr = omni.instruction.toUpperCase();

    const telemetry = telemetryFromParsedLog(omni);
    if (telemetry) {
      state.telemetry = mergeTelemetry(state.telemetry, telemetry);
      state.lastTelemetryTs = log.ts;
    }

    const openLo = omni.lockInstr === 0;
    const openH0 = omni.horseshoe === 0;
    const u = String(omni.instruction || "").toUpperCase();
    const openFallback = u === "LO" || u === "L0";
    const closeOnL1 = u === "L1";

    if ((openLo || openH0 || openFallback) && state.status !== "OPEN") {
      if (!state.lastChangeTs || log.ts - state.lastChangeTs >= debounceMs) {
        state.status = "OPEN";
        state.openSince = log.ts;
        state.lastChangeTs = log.ts;
      }
    } else if (closeOnL1 && state.status !== "CLOSED") {
      if (!state.lastChangeTs || log.ts - state.lastChangeTs >= debounceMs) {
        state.status = "CLOSED";
        state.openSince = null;
        state.lastChangeTs = log.ts;
      }
    }

    states.set(imei, state);
  }

  return Array.from(states.values()).sort((a, b) => b.lastTs - a.lastTs);
};
const getGroupKey = (session: CyclingActivity): string => {
  const raw = session.raw || {};
  const rentalId = raw?.rental?.id ?? raw?.rentalId ?? raw?.rental_id ?? raw?.rentalID ?? raw?.rental?.orderId;
  if (rentalId) return String(rentalId);
  if (session.raw?.orderId) return String(session.raw.orderId);
  if (session.raw?.historyId) return String(session.raw.historyId);
  if (session.raw?.id) return String(session.raw.id);
  if (session.imei && session.startedAt) return `${session.imei}-${session.startedAt}`;
  return session.id;
};

const buildHistoryGroups = (sessions: CyclingActivity[]): HistoryGroup[] => {
  const map = new Map<string, HistoryGroup>();
  sessions.forEach((session) => {
    const key = getGroupKey(session);
    const metrics = session.derived;
    if (!map.has(key)) {
      map.set(key, {
        key,
        primary: session,
        sessions: [session],
        totalDistanceKm: metrics.rideKm,
        totalCo2Kg: metrics.co2Kg,
        totalCalories: metrics.calories,
      });
    } else {
      const group = map.get(key)!;
      group.sessions.push(session);
      group.totalDistanceKm += metrics.rideKm;
      group.totalCo2Kg += metrics.co2Kg;
      group.totalCalories += metrics.calories;
      if ((session.endedAt ?? 0) > (group.primary.endedAt ?? 0)) {
        group.primary = session;
      }
    }
  });
  return Array.from(map.values()).sort((a, b) => {
    const aEnd = a.primary.endedAt ?? a.primary.startedAt ?? 0;
    const bEnd = b.primary.endedAt ?? b.primary.startedAt ?? 0;
    return bEnd - aEnd;
  });
};

const buildTelemetryActivity = (
  item: any,
  index: number,
  fallbackStatus: "active" | "completed"
): CyclingActivity => {
  const parsed = safeParseJSON(item?.json ?? item?.payload ?? item?.telemetry);
  const telemetry: OmniTelemetry = {
    estimatedRemainingCyclingMiles: asNumber(parsed.estimatedRemainingCyclingMiles ?? item?.estimatedRemainingCyclingMiles),
    currentElectricQuantity: asNumber(parsed.currentElectricQuantity ?? item?.currentElectricQuantity ?? item?.battery),
    currentSpeed: asNumber(parsed.currentSpeed ?? item?.currentSpeed ?? item?.speed),
    faultInformation: asNumber(parsed.faultInformation ?? item?.faultInformation ?? item?.fault),
    mileagePerRide: asNumber(parsed.mileagePerRide ?? item?.mileagePerRide),
    currentMode: asNumber(parsed.currentMode ?? item?.currentMode ?? item?.mode),
    chargingState: asNumber(parsed.chargingState ?? item?.chargingState ?? item?.charging),
    totalMileageRidden: asNumber(parsed.totalMileageRidden ?? item?.totalMileageRidden),
  };

  const derived = deriveRideMetrics(telemetry);
  const startedAt = asNumber(item?.startedAt ?? item?.openTs ?? item?.ts ?? item?.createdAt);
  const endedAt = asNumber(item?.endedAt ?? item?.closeTs ?? item?.closedAt);

  const status = (() => {
    const incomingStatus = item?.status ?? item?.state;
    const text = typeof incomingStatus === "string" ? incomingStatus.toLowerCase() : "";
    if (["active", "running", "open"].includes(text)) return "active";
    if (["completed", "closed", "done", "history", "paid", "unpaid"].includes(text)) return "completed";
    if (!endedAt && (telemetry.currentSpeed ?? 0) > 0) return "active";
    if (!endedAt && telemetry.chargingState === 0) return "active";
    if (endedAt) return "completed";
    return fallbackStatus;
  })();

  const incomingSource = typeof item?.source === "string" ? item.source.toLowerCase() : "";
  const sourceTag: "telemetry" | "rental" = incomingSource === "rental" ? "rental" : "telemetry";

  return {
    id: String(item?.id ?? item?._id ?? item?.logId ?? item?.imei ?? `telemetry-${index}`),
    status,
    startedAt: startedAt ?? null,
    endedAt: endedAt ?? null,
    imei: item?.imei ?? item?.deviceId ?? item?.serial,
    guestName: item?.guestName ?? item?.meta?.guestName ?? item?.rental?.guestName,
    resortName: item?.resortName ?? item?.meta?.resortName ?? item?.rental?.resortName,
    roomNumber: item?.roomNumber ?? item?.meta?.roomNumber ?? item?.rental?.roomNumber,
    instruction: item?.instruction,
    source: "telemetry",
    telemetry,
    derived,
    raw: item,
  };
};

const buildRentalActivity = (item: any, index: number): CyclingActivity => {
  const startedAt = asNumber(item?.startedAt);
  const endedAt = asNumber(item?.endedAt);
  const telemetry: OmniTelemetry = {};
  const statusText = typeof item?.status === "string" ? item.status.toLowerCase() : "";
  const status: "active" | "completed" = statusText === "active" ? "active" : "completed";

  return {
    id: String(item?.id ?? item?._id ?? `rental-${index}`),
    status,
    startedAt: startedAt ?? null,
    endedAt: endedAt ?? null,
    imei: item?.deviceId,
    guestName: item?.guestName ?? "Guest",
    resortName: item?.resortName,
    roomNumber: item?.roomNumber,
    instruction: undefined,
    source: "rental",
    telemetry,
    derived: { rideMiles: 0, rideKm: 0, co2Kg: 0, calories: 0 },
    raw: item,
  };
};

const normalizePayload = (payload: any): NormalizeResult => {
  const collect = (candidate: any, fallbackStatus: "active" | "completed") => {
    if (!candidate) return [] as CyclingActivity[];
    if (Array.isArray(candidate)) return candidate.map((item, index) => buildTelemetryActivity(item, index, fallbackStatus));
    if (Array.isArray(candidate?.items)) return candidate.items.map((item: any, index: number) => buildTelemetryActivity(item, index, fallbackStatus));
    return [] as CyclingActivity[];
  };

  const activeSource = collect(payload?.active ?? payload?.running ?? payload?.open, "active");

  let historyRaw: any[] | null = null;
  const candidates = [payload?.history, payload?.completed, payload?.records, payload?.data, payload];
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      historyRaw = candidate;
      break;
    }
    if (Array.isArray(candidate?.items)) {
      historyRaw = candidate.items;
      break;
    }
  }
  const history = (historyRaw ?? []).map((item, index) => buildTelemetryActivity(item, index, "completed"));

  return { active: activeSource, history };
};
const deriveSummary = (active: CyclingActivity[], history: CyclingActivity[]) => {
  const batterySamples = active
    .map((item) => toSafePercentage(item.telemetry.currentElectricQuantity ?? null))
    .filter((value): value is number => value !== null);
  const averageBattery = batterySamples.length
    ? batterySamples.reduce((sum, val) => sum + val, 0) / batterySamples.length
    : null;

  const mileageKm = history.reduce((sum, item) => sum + item.derived.rideKm, 0) + active.reduce((sum, item) => sum + item.derived.rideKm, 0);
  const co2Kg = history.reduce((sum, item) => sum + item.derived.co2Kg, 0);
  const calories = history.reduce((sum, item) => sum + item.derived.calories, 0);
  const totalMileageKm = history.reduce((sum, item) => {
    const totalMileageMiles = item.telemetry.totalMileageRidden ?? null;
    if (totalMileageMiles === null || Number.isNaN(totalMileageMiles)) return sum;
    return sum + toKm(totalMileageMiles);
  }, 0);

  return {
    activeCount: active.length,
    averageBattery,
    totalTrips: history.length,
    mileageKm,
    co2Kg,
    calories,
    totalMileageKm,
  };
};

const buildActiveFromDeviceState = (state: DeviceState): CyclingActivity => {
  const telemetry: OmniTelemetry = state.telemetry ? { ...state.telemetry } : {};
  return {
    id: `device-${state.imei}`,
    status: "active",
    startedAt: state.openSince ?? state.lastTs,
    endedAt: null,
    imei: state.imei,
    guestName: undefined,
    resortName: undefined,
    roomNumber: undefined,
    instruction: state.lastInstr,
    source: "telemetry",
    telemetry,
    derived: deriveRideMetrics(telemetry),
    raw: { deviceState: state },
  };
};

const enrichSessionWithDeviceState = (session: CyclingActivity, state: DeviceState): CyclingActivity => {
  const mergedTelemetry = mergeTelemetry(session.telemetry, state.telemetry);
  return {
    ...session,
    status: "active",
    startedAt: state.openSince ?? session.startedAt ?? null,
    endedAt: null,
    instruction: state.lastInstr ?? session.instruction,
    telemetry: mergedTelemetry,
    derived: deriveRideMetrics(mergedTelemetry),
  };
};

const alignActivitiesWithDeviceStates = (base: NormalizeResult, deviceStates: DeviceState[]): NormalizeResult => {
  if (!deviceStates.length) return base;

  const openMap = new Map<string, DeviceState>(
    deviceStates
      .filter((state) => state.status === "OPEN")
      .map((state) => [state.imei, state])
  );

  const nextActive: CyclingActivity[] = [];
  const nextHistory: CyclingActivity[] = [];

  for (const session of base.active) {
    const key = session.imei ? session.imei.trim() : "";
    const state = key ? openMap.get(key) : undefined;
    if (state) {
      nextActive.push(enrichSessionWithDeviceState(session, state));
      openMap.delete(key);
    } else {
      nextHistory.push({ ...session, status: "completed" });
    }
  }

  for (const session of base.history) {
    const key = session.imei ? session.imei.trim() : "";
    const state = key ? openMap.get(key) : undefined;
    if (state) {
      nextActive.push(enrichSessionWithDeviceState({ ...session, status: "active", endedAt: null }, state));
      openMap.delete(key);
    } else {
      nextHistory.push(session);
    }
  }

  for (const state of openMap.values()) {
    nextActive.push(buildActiveFromDeviceState(state));
  }

  return { active: nextActive, history: nextHistory };
};

const fetchDeviceStates = async (): Promise<DeviceState[]> => {
  try {
    const res = await fetch("/api/omni/logs", { cache: "no-store" });
    const text = await res.text();
    let parsed: any = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = null;
    }
    const logs: OmniLog[] = Array.isArray(parsed?.logs) ? parsed.logs : Array.isArray(parsed) ? parsed : [];
    if (!Array.isArray(logs) || logs.length === 0) return [];
    return computeDeviceStatesFromLogs(logs);
  } catch (err) {
    console.warn("Failed to fetch OMNI logs for cycling history", err);
    return [];
  }
};
export default function CyclingHistoryPage() {
  const [activeSessions, setActiveSessions] = useState<CyclingActivity[]>([]);
  const [historySessions, setHistorySessions] = useState<CyclingActivity[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowTs, setNowTs] = useState(() => Date.now());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [historyPage, setHistoryPage] = useState(1);

  const API_BASE = useMemo(() => {
    if ((process.env.NEXT_ENABLE_API_PROXY || "").trim() === "1" || process.env.NODE_ENV !== "production") {
      return "/api/backend";
    }
    const env = process.env.NEXT_PUBLIC_API_BASE_URL || process.env.NEXT_PUBLIC_API_URL;
    if (env && env.trim().length > 0) return `${env.replace(/\/$/, "")}/api`;
    return "http://localhost:4000/api";
  }, []);

  useEffect(() => {
    const interval = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    const headers = token ? { Authorization: `Bearer ${token}` } : undefined;

    const deviceStatesPromise = fetchDeviceStates().catch(() => [] as DeviceState[]);

    const applyAlignedResult = async (result: NormalizeResult) => {
      const deviceStates = await deviceStatesPromise;
      const aligned = alignActivitiesWithDeviceStates(result, deviceStates);
      setActiveSessions(aligned.active);
      setHistorySessions(aligned.history);
      setHistoryPage(1);
    };

    const fallbackToRentals = async (message?: string) => {
      if (message) setError(message);
      try {
        const res = await fetch(`${API_BASE}/rentals/list?status=all`, { headers });
        const data = await res.json().catch(() => null);
        const list = Array.isArray(data) ? data : [];
        const normalized = list.map((item, index) => buildRentalActivity(item, index));
        const base: NormalizeResult = {
          active: normalized.filter((item) => item.status === "active"),
          history: normalized.filter((item) => item.status === "completed"),
        };
        await applyAlignedResult(base);
      } catch (fallbackError: any) {
        setActiveSessions([]);
        setHistorySessions([]);
        setError(fallbackError?.message || "Unable to load cycling data");
      }
    };

    try {
      const response = await fetch(`${API_BASE}/omni/cycling/history`, {
        headers,
        cache: "no-store",
      });

      if (!response.ok) {
        await fallbackToRentals("Telemetry data not available yet. Showing rental records instead.");
        setLoading(false);
        return;
      }

      const payload = await response.json().catch(() => null);
      if (!payload) {
        await fallbackToRentals("Telemetry payload was empty. Showing rental records instead.");
        setLoading(false);
        return;
      }

      const normalized = normalizePayload(payload);
      await applyAlignedResult(normalized);
    } catch (err) {
      console.error("Failed to load cycling telemetry", err);
      await fallbackToRentals("Failed to load telemetry. Showing rental records instead.");
    }

    setLoading(false);
  }, [API_BASE]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      load();
    }, AUTO_REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [autoRefresh, load]);
  const summary = useMemo(() => deriveSummary(activeSessions, historySessions), [activeSessions, historySessions]);

  const sortedActive = useMemo(
    () => [...activeSessions].sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0)),
    [activeSessions]
  );

  const sortedHistory = useMemo(
    () => [...historySessions].sort((a, b) => {
      const endA = a.endedAt ?? a.startedAt ?? 0;
      const endB = b.endedAt ?? b.startedAt ?? 0;
      return endB - endA;
    }),
    [historySessions]
  );

  const historyGroups = useMemo(() => buildHistoryGroups(sortedHistory), [sortedHistory]);

  useEffect(() => {
    setHistoryPage(1);
  }, [historyGroups.length]);

  const totalHistoryPages = Math.max(1, Math.ceil(historyGroups.length / HISTORY_PAGE_SIZE));

  useEffect(() => {
    setHistoryPage((prev) => {
      const next = Math.min(Math.max(prev, 1), totalHistoryPages);
      return next === prev ? prev : next;
    });
  }, [totalHistoryPages]);

  const startIndex = (historyPage - 1) * HISTORY_PAGE_SIZE;
  const pagedHistoryGroups = historyGroups.slice(startIndex, startIndex + HISTORY_PAGE_SIZE);

  const renderSourceBadge = (source: CyclingActivity["source"]) => (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
        source === "telemetry"
          ? "bg-sky-50 text-sky-700 ring-1 ring-sky-200"
          : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"
      }`}
    >
      {source === "telemetry" ? "Telemetry" : "Rental"}
    </span>
  );

  const treesEquivalent = summary.co2Kg / 21.77;
  return (
    <main className="space-y-6 p-5">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Cycling History</h1>
          <p className="text-sm text-slate-600">
            Monitor active bikes, lock events from OMNI, and business metrics such as distance, CO2 savings, and rider energy.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={load}
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium text-slate-800 shadow-sm transition hover:bg-slate-50"
            disabled={loading}
          >
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button
            onClick={() => setAutoRefresh((prev) => !prev)}
            className={`rounded-lg border px-3 py-2 text-sm font-medium shadow-sm transition ${
              autoRefresh
                ? "border-sky-300 bg-sky-50 text-sky-800 hover:bg-sky-100"
                : "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
            }`}
          >
            Auto refresh: {autoRefresh ? "On" : "Off"}
          </button>
        </div>
      </header>

      {error && (
        <div className="rounded-xl bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">
          {error}
        </div>
      )}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active rides</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{integerFormatter.format(summary.activeCount)}</div>
          <div className="mt-1 text-xs text-slate-500">Currently unlocked bikes</div>
          {summary.averageBattery != null ? (
            <div className="mt-3 flex items-center gap-2 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-700 ring-1 ring-sky-200">
                Avg battery {numberFormatter.format(summary.averageBattery)}%
              </span>
              <span className="text-slate-400">-</span>
              <span>{sortedActive.length ? diffLabel(sortedActive[0].startedAt, nowTs) : "-"} in progress</span>
            </div>
          ) : (
            <div className="mt-3 text-xs text-slate-500">Battery data not available</div>
          )}
        </div>
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Distance</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{numberFormatter.format(summary.mileageKm)} km</div>
          <div className="mt-1 text-xs text-slate-500">Telemetry distance including active rides</div>
          <div className="mt-3 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700 ring-1 ring-emerald-200">
            CO2 saved {numberFormatter.format(summary.co2Kg)} kg
          </div>
        </div>
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Calories</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{integerFormatter.format(summary.calories)}</div>
          <div className="mt-1 text-xs text-slate-500">Estimated rider energy for all trips</div>
        </div>
        <div className="rounded-2xl bg-white/80 p-4 ring-1 ring-slate-200">
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Completed trips</div>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{integerFormatter.format(summary.totalTrips)}</div>
          <div className="mt-1 text-xs text-slate-500">Automatically recorded when the lock closes</div>
          <div className="mt-3 text-xs text-slate-600">Fleet odometer {numberFormatter.format(summary.totalMileageKm)} km</div>
        </div>
      </section>
      <section className="grid gap-6 lg:grid-cols-[2fr,1fr]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Currently Riding</h2>
              <p className="text-xs text-slate-500">Live data from the latest OMNI callbacks</p>
            </div>
            <span className="text-xs text-slate-400">{sortedActive.length} bikes</span>
          </div>
          {loading && sortedActive.length === 0 ? (
            <div className="space-y-3">
              {[0, 1].map((item) => (
                <div key={item} className="h-28 animate-pulse rounded-2xl bg-slate-100" />
              ))}
            </div>
          ) : sortedActive.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
              No bikes are currently in use. New trips will appear here as soon as the lock opens.
            </div>
          ) : (
            <div className="space-y-4">
              {sortedActive.map((session) => {
                const battery = toSafePercentage(session.telemetry.currentElectricQuantity ?? null);
                const remainMiles = session.telemetry.estimatedRemainingCyclingMiles;
                const remainKm = remainMiles != null ? toKm(remainMiles) : null;
                const speed = session.telemetry.currentSpeed ?? null;
                const charging = session.telemetry.chargingState;

                return (
                  <div key={session.id} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <span className="font-mono text-slate-600">{session.imei ?? "Unknown IMEI"}</span>
                          {renderSourceBadge(session.source)}
                        </div>
                        <div className="mt-1 text-lg font-semibold text-slate-900">
                          {session.guestName || "Guest"} {session.roomNumber ? `- ${session.roomNumber}` : ""}
                        </div>
                        <div className="text-xs text-slate-500">
                          Started {formatTimestamp(session.startedAt)} - {diffLabel(session.startedAt, nowTs)} elapsed
                        </div>
                        {session.resortName && (
                          <div className="mt-1 text-xs text-slate-500">{session.resortName}</div>
                        )}
                      </div>
                      <div className="space-y-2 text-right text-xs text-slate-500">
                        {speed !== null && (
                          <div className="inline-flex items-center justify-end gap-1 rounded-full bg-sky-50 px-2 py-1 text-sky-700 ring-1 ring-sky-200">
                            {numberFormatter.format(speed)} km/h
                          </div>
                        )}
                        {charging !== null && (
                          <div className="inline-flex items-center justify-end gap-1 rounded-full px-2 py-1 ring-1 ring-slate-200">
                            {charging === 1 ? "Charging" : "In use"}
                          </div>
                        )}
                        {session.instruction && (
                          <div className="text-[11px] text-slate-400">Instruction {String(session.instruction).toUpperCase()}</div>
                        )}
                      </div>
                    </div>

                    {battery !== null && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between text-xs text-slate-500">
                          <span>Battery</span>
                          <span className="font-semibold text-slate-700">{numberFormatter.format(battery)}%</span>
                        </div>
                        <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-slate-200">
                          <div
                            className={`h-full ${batteryBarClass(battery)} transition-all`}
                            style={{ width: `${battery}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <div className="mt-4 grid gap-3 text-xs text-slate-600 sm:grid-cols-3">
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Current trip</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {numberFormatter.format(session.derived.rideKm)} km
                        </div>
                        <div className="text-[11px] text-slate-500">CO2 saved {numberFormatter.format(session.derived.co2Kg)} kg</div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Estimated range</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          {remainKm !== null ? `${numberFormatter.format(remainKm)} km` : "-"}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {remainMiles !== null ? `${numberFormatter.format(remainMiles)} miles` : "No estimate"}
                        </div>
                      </div>
                      <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
                        <div className="text-[11px] uppercase tracking-wide text-slate-400">Status</div>
                        <div className="mt-1 text-sm font-semibold text-slate-800">
                          Fault {session.telemetry.faultInformation ?? "None"}
                        </div>
                        <div className="text-[11px] text-slate-500">Mode {session.telemetry.currentMode ?? "-"}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </section>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Trip history</h2>
            <p className="text-xs text-slate-500">Grouped by rental. Each trip may include several cycling sessions.</p>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500">
            <span>{historyGroups.length} rentals</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setHistoryPage((prev) => Math.max(1, prev - 1))}
                disabled={historyPage <= 1}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 transition enabled:hover:bg-slate-50 disabled:opacity-50"
              >
                Prev
              </button>
              <span>
                Page {historyPage} / {totalHistoryPages}
              </span>
              <button
                onClick={() => setHistoryPage((prev) => Math.min(totalHistoryPages, prev + 1))}
                disabled={historyPage >= totalHistoryPages}
                className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-800 transition enabled:hover:bg-slate-50 disabled:opacity-50"
              >
                Next
              </button>
            </div>
          </div>
        </div>
        {loading && historyGroups.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-2xl bg-slate-100" />
            ))}
          </div>
        ) : historyGroups.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white/60 p-6 text-center text-sm text-slate-500">
            No trip history yet. Once a ride ends, its sessions will appear here.
          </div>
        ) : (
          <div className="space-y-4">
            {pagedHistoryGroups.map((group) => {
              const { primary } = group;
              const durationLabel = diffLabel(primary.startedAt, primary.endedAt);

              return (
                <div key={group.key} className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span className="font-mono text-slate-600">{primary.imei ?? "Unknown IMEI"}</span>
                        {renderSourceBadge(primary.source)}
                      </div>
                      <div className="mt-1 text-base font-semibold text-slate-900">
                        {primary.guestName || "Guest"} {primary.roomNumber ? `- ${primary.roomNumber}` : ""}
                      </div>
                      <div className="text-xs text-slate-500">
                        {formatTimestamp(primary.startedAt)} -{'>'} {formatTimestamp(primary.endedAt)} ({durationLabel})
                      </div>
                      {primary.resortName && (
                        <div className="mt-1 text-xs text-slate-500">{primary.resortName}</div>
                      )}
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <div>Total distance {numberFormatter.format(group.totalDistanceKm)} km</div>
                      <div>CO2 saved {numberFormatter.format(group.totalCo2Kg)} kg</div>
                      <div>Calories {integerFormatter.format(group.totalCalories)}</div>
                    </div>
                  </div>

                  <div className="mt-4 space-y-2">
                    {group.sessions.map((session) => (
                      <div key={session.id} className="rounded-xl border border-slate-100 bg-slate-50/60 p-3 text-xs text-slate-600">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="font-medium text-slate-800">
                            {formatTimestamp(session.startedAt)} -{'>'} {formatTimestamp(session.endedAt)}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500">
                            <span>{numberFormatter.format(session.derived.rideKm)} km</span>
                            <span>CO2 {numberFormatter.format(session.derived.co2Kg)} kg</span>
                            <span>Calories {integerFormatter.format(session.derived.calories)}</span>
                          </div>
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-3 text-[11px] text-slate-500">
                          <span>Mode {session.telemetry.currentMode ?? "-"}</span>
                          <span>Speed {session.telemetry.currentSpeed ?? "-"}</span>
                          {session.instruction && <span>Instruction {String(session.instruction).toUpperCase()}</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}



