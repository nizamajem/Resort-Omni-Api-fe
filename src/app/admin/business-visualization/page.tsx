"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { useAuth } from "@/app/auth.context";
import { useRouter } from "next/navigation";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { api } from "@/app/lib/api";
type PackageId = "1h" | "3h" | "12h" | "1d";
type TrendMetric = "rides" | "minutes" | "revenue";
type TrendPoint = { date: string; rides: number; minutes: number; revenue: number };
type TopResort = { resortName: string; rides: number; minutes: number; revenue: number };
type InsightPayload = { text: string; generatedAt: string; source?: string; filters?: Record<string, unknown> } | null;
type InsightSectionKey = "operationalInsights" | "businessAnalystInsights" | "actionableRecommendations";
const formatIDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const formatNumber = new Intl.NumberFormat("id-ID");
const parseInsightText = (text: string) => {
  const sections = {
    summary: [] as string[],
    operationalInsights: [] as string[],
    businessAnalystInsights: [] as string[],
    actionableRecommendations: [] as string[],
  };
  const normalizedHeading = (line: string) =>
    line
      .toLowerCase()
      .replace(/[*_`#:]/g, "")
      .replace(/\.$/, "")
      .trim();
  const detectHeading = (line: string) => {
    const value = normalizedHeading(line);
    if (value.includes("operational insight")) return "operationalInsights" as const;
    if (value.includes("business analyst")) return "businessAnalystInsights" as const;
    if (value.includes("actionable") && value.includes("recommend")) return "actionableRecommendations" as const;
    return null;
  };
  const bulletCandidates: string[] = [];
  let currentSection: keyof typeof sections = "summary";
  text
    .split(/\r?\n|\u2022/)
    .map((line) => line.trim())
    .forEach((line) => {
      if (!line) return;
      const heading = detectHeading(line);
      if (heading) {
        currentSection = heading;
        return;
      }
      const bulletMatch = line.match(/^[-*+\u2022]\s*(.+)$/);
      const content = bulletMatch ? bulletMatch[1].trim() : line;
      if (bulletMatch) bulletCandidates.push(content);
      sections[currentSection].push(content);
    });
  const initialStructured =
    sections.operationalInsights.length > 0 ||
    sections.businessAnalystInsights.length > 0 ||
    sections.actionableRecommendations.length > 0;
  if (!initialStructured && bulletCandidates.length) {
    const queue = bulletCandidates.slice();
    const take = (count: number) => {
      const items: string[] = [];
      while (items.length < count && queue.length) {
        const value = queue.shift();
        if (value) items.push(value);
      }
      return items;
    };
    sections.operationalInsights.push(...take(3));
    sections.businessAnalystInsights.push(...take(2));
    sections.actionableRecommendations.push(...take(Math.max(3, queue.length)));
    if (queue.length) {
      sections.actionableRecommendations.push(...queue.splice(0));
    }
  }
  const ensureCoverage = () => {
    const used = new Set<string>([
      ...sections.summary,
      ...sections.operationalInsights,
      ...sections.businessAnalystInsights,
      ...sections.actionableRecommendations,
    ].filter(Boolean));
    const queue = bulletCandidates.filter((item) => item && !used.has(item));
    const assign = (key: keyof typeof sections, targetCount: number) => {
      while (sections[key].length < targetCount && queue.length) {
        const value = queue.shift();
        if (value) {
          sections[key].push(value);
          used.add(value);
        }
      }
    };
    assign('operationalInsights', 3);
    assign('businessAnalystInsights', 2);
    assign('actionableRecommendations', 3);
  };
  ensureCoverage();
  const hasStructuredContent =
    sections.operationalInsights.length > 0 ||
    sections.businessAnalystInsights.length > 0 ||
    sections.actionableRecommendations.length > 0;
  if (!hasStructuredContent && sections.summary.length && !bulletCandidates.length) {
    const summaryQueue = sections.summary.filter(Boolean);
    if (summaryQueue.length) {
      sections.operationalInsights.push(summaryQueue[0]);
      if (summaryQueue[1]) sections.businessAnalystInsights.push(summaryQueue[1]);
      if (summaryQueue[2]) sections.actionableRecommendations.push(summaryQueue[2]);
    }
  }
  ensureCoverage();
  const finalStructured =
    sections.operationalInsights.length > 0 ||
    sections.businessAnalystInsights.length > 0 ||
    sections.actionableRecommendations.length > 0;
  return { ...sections, hasStructuredContent: finalStructured };
};
const formatCurrencySegments = (value: number) => {
  const formatted = formatIDR.format(Math.abs(value));
  const sanitized = formatted.replace(/\u00A0/g, " ").trim();
  const symbolMatch = sanitized.match(/^[^\d-]+/);
  const symbol = symbolMatch ? symbolMatch[0].trim() : "Rp";
  const remainder = sanitized.slice(symbolMatch ? symbolMatch[0].length : 0).trim();
  const rawSegments = remainder ? remainder.split(".").filter(Boolean) : [];
  return {
    symbol: value < 0 ? `-${symbol}` : symbol,
    segments: rawSegments.length > 0 ? rawSegments : ["0"],
  };
};
type VisualizationResponse = {
  range: { start: string; end: string; timeframeDays: number };
  filters: { resorts: string[]; packages: string[]; timeframeDays: number };
  totals: { rides: number; minutes: number; revenue: number; averageMinutes: number; resortCount: number };
  packages: Record<PackageId, number>;
  trend: TrendPoint[];
  topResorts: TopResort[];
  availableResorts: { id: string; label: string }[];
  lastUpdated: string | null;
  insights: InsightPayload;
};
const PACKAGE_OPTIONS: { id: "all" | PackageId; label: string }[] = [
  { id: "all", label: "All Packages" },
  { id: "1h", label: "1 Hour" },
  { id: "3h", label: "3 Hours" },
  { id: "12h", label: "12 Hours" },
  { id: "1d", label: "1 Day" },
];
const TIMEFRAME_OPTIONS = [
  { id: "7d", label: "Last 7 Days" },
  { id: "14d", label: "Last 14 Days" },
  { id: "30d", label: "Last 30 Days" },
  { id: "custom", label: "Custom Range" },
] as const;
type ChartPoint = {
  label: string;
  value: number;
  raw: TrendPoint;
};
type TrendChartProps = {
  points: ChartPoint[];
  metricLabel: string;
  color: string;
  valueFormatter: (value: number) => string;
};
function PackageDistribution({ data, total }: { data: Record<PackageId, number>; total: number }) {
  const entries = (Object.keys(data) as PackageId[]).map((pkg) => ({ key: pkg, value: data[pkg] || 0 }));
  return (
    <div className="space-y-3">
      {entries.map(({ key, value }) => {
        const percent = total > 0 ? (value / total) * 100 : 0;
        const label = PACKAGE_OPTIONS.find((p) => p.id === key)?.label ?? key;
        return (
          <div key={key}>
            <div className="flex items-center justify-between text-sm text-slate-600">
              <span className="font-medium text-slate-800">{label}</span>
              <span>{`${formatNumber.format(value)} rides (${percent.toFixed(1)}%)`}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
function TrendChart({ points, metricLabel, color, valueFormatter }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const hasData = points.length > 0;
  const width = Math.max(points.length * 22, 360);
  const height = 160;
  const values = points.map((point) => point.value);
  const maxValue = values.length ? Math.max(...values) : 1;
  const minValue = values.length ? Math.min(...values) : 0;
  const span = maxValue - minValue || 1;
  const step = points.length > 1 ? width / (points.length - 1) : width;
  const hover = hoverIndex !== null ? points[hoverIndex] : null;
  const handlePointer = (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const clientX = "touches" in event ? event.touches[0]?.clientX : event.clientX;
    const target = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(Math.max(clientX - target.left, 0), target.width);
    const index = points.length > 1 ? Math.round(relativeX / (target.width / (points.length - 1))) : 0;
    setHoverIndex(Math.min(points.length - 1, Math.max(0, index)));
  };
  return (
    <div className="space-y-3">
      <div
        className="relative overflow-hidden rounded-xl border border-slate-200 bg-white"
        onMouseLeave={() => setHoverIndex(null)}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="h-40 w-full"
          onMouseMove={handlePointer}
          onTouchMove={handlePointer}
          onTouchStart={handlePointer}
        >
          <defs>
            <linearGradient id="trendGradient" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity="0.35" />
              <stop offset="100%" stopColor={color} stopOpacity="0" />
            </linearGradient>
          </defs>
          {hasData ? (
            <>
              <polyline
                points={`0,${height} ${points
                  .map((point, index) => {
                    const x = index * step;
                    const norm = (point.value - minValue) / span;
                    const y = height - norm * height;
                    return `${x},${y}`;
                  })
                  .join(" ")} ${width},${height}`}
                fill="url(#trendGradient)"
                stroke="none"
              />
              <polyline
                points={points
                  .map((point, index) => {
                    const x = index * step;
                    const norm = (point.value - minValue) / span;
                    const y = height - norm * height;
                    return `${x},${y}`;
                  })
                  .join(" ")}
                fill="none"
                stroke={color}
                strokeWidth={3}
                strokeLinecap="round"
              />
              {points.map((point, index) => {
                const norm = (point.value - minValue) / span;
                const cx = index * step;
                const cy = height - norm * height;
                const isActive = index === hoverIndex;
                return (
                  <circle
                    key={point.label}
                    cx={cx}
                    cy={cy}
                    r={isActive ? 5 : 3}
                    fill={isActive ? color : "#ffffff"}
                    stroke={color}
                    strokeWidth={isActive ? 2 : 1.5}
                  />
                );
              })}
            </>
          ) : null}
        </svg>
        {hover && (
          <div
            className="pointer-events-none absolute top-3 w-40 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg"
            style={{ left: `${points.length > 1 ? (hoverIndex! / (points.length - 1)) * 100 : 0}%` }}
          >
            <div className="font-semibold text-slate-900">{hover.label}</div>
            <div className="mt-1 text-slate-600">{valueFormatter(hover.value)} {metricLabel}</div>
          </div>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto border-t border-slate-200 pt-2 text-xs text-slate-500">
        {points.map((point) => (
          <span key={point.label} className="min-w-[60px] text-center">
            {point.label}
          </span>
        ))}
      </div>
    </div>
  );
}
export default function BusinessVisualizationPage() {
  const { role } = useAuth();
  const router = useRouter();
  const [resolvedRole, setResolvedRole] = useState<string | null>(role ?? null);
  useEffect(() => {
    if (!role) {
      try {
        const stored = typeof window !== "undefined" ? localStorage.getItem("role") : null;
        if (stored) setResolvedRole(stored);
      } catch {}
    } else {
      setResolvedRole(role);
    }
  }, [role]);
  useEffect(() => {
    if (resolvedRole && resolvedRole !== "superadmin") {
      router.replace("/dashboard");
    }
  }, [resolvedRole, router]);
  const [resortOptions, setResortOptions] = useState<{ id: string; label: string }[]>([
    { id: "all", label: "All Resorts" },
  ]);
  const [resortFilter, setResortFilter] = useState<string>("all");
  const [packageFilter, setPackageFilter] = useState<string>("all");
  const [timeframe, setTimeframe] = useState<string>("7d");
  const [customFrom, setCustomFrom] = useState<string>("");
  const [customTo, setCustomTo] = useState<string>("");
  const [trendMetric, setTrendMetric] = useState<TrendMetric>("minutes");
  const [data, setData] = useState<VisualizationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [insightBusy, setInsightBusy] = useState(false);
  const [recommendationModalOpen, setRecommendationModalOpen] = useState(false);
  const [recommendationPending, setRecommendationPending] = useState(false);
  const shouldFetch = timeframe !== "custom" || (customFrom && customTo);
  useEffect(() => {
    if (timeframe === "custom" && (!(customFrom && customTo))) {
      setData(null);
      setError(null);
    }
  }, [timeframe, customFrom, customTo]);
  const fetchData = useCallback(async () => {
    if (!shouldFetch) return;
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string> = {};
      if (resortFilter !== "all") params.resort = resortFilter;
      if (packageFilter !== "all") params.package = packageFilter;
      params.timeframe = timeframe;
      if (timeframe === "custom") {
        if (customFrom) params.start = customFrom;
        if (customTo) params.end = customTo;
      }
      const { data } = await api.get("/analytics/business-visualization", { params });
      setData(data as VisualizationResponse);
      const unique = new Map<string, { id: string; label: string }>();
      unique.set("all", { id: "all", label: "All Resorts" });
      (data?.availableResorts ?? []).forEach((item: { id: string; label: string }) => {
        const id = item?.id || item?.label;
        if (!id) return;
        const label = item?.label || id;
        if (!unique.has(id)) unique.set(id, { id, label });
      });
      const optionList = Array.from(unique.values());
      setResortOptions(optionList);
      if (resortFilter !== "all" && !unique.has(resortFilter)) {
        setResortFilter("all");
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || "Failed to load analytics data.";
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [shouldFetch, resortFilter, packageFilter, timeframe, customFrom, customTo]);
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  const trendPoints: ChartPoint[] = useMemo(() => {
    if (!data) return [];
    return data.trend.map((point) => ({
      label: new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: trendMetric === "rides" ? point.rides : trendMetric === "minutes" ? point.minutes : point.revenue,
      raw: point,
    }));
  }, [data, trendMetric]);
  const valueFormatter = useMemo(() => {
    if (trendMetric === "revenue") {
      return (value: number) => formatIDR.format(value);
    }
    return (value: number) => formatNumber.format(value);
  }, [trendMetric]);
  const revenueDisplay = useMemo(() => formatCurrencySegments(data?.totals.revenue ?? 0), [data?.totals.revenue]);
  const metricLabel = trendMetric === "rides" ? "rides" : trendMetric === "minutes" ? "minutes" : "revenue";
  const topResorts = data?.topResorts ?? [];
  const packageTotal = useMemo(() => (data ? Object.values(data.packages || {}).reduce((acc, val) => acc + val, 0) : 0), [data]);
  const insights = data?.insights ?? null;
  const structuredInsights = useMemo(() => (insights?.text ? parseInsightText(insights.text) : null), [insights?.text]);
  const hasRecommendation = Boolean(insights?.text && insights.text.trim().length > 0);
  const lastRecommendationLabel = useMemo(() => (insights?.generatedAt ? new Date(insights.generatedAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : null), [insights?.generatedAt]);
  const modalSubheading = hasRecommendation
    ? (lastRecommendationLabel ? 'Most recent snapshot - ' + lastRecommendationLabel : 'Most recent snapshot')
    : 'No recommendation available yet.';
  const insightSectionConfig = useMemo<Array<{
    key: InsightSectionKey;
    title: string;
    description: string;
    containerClass: string;
    badgeClass: string;
    dotClass: string;
    barClass: string;
    countBadgeClass: string;
  }>>(
    () => [
      {
        key: 'operationalInsights',
        title: 'Operational Insight',
        description: 'Signals about day-to-day performance and anomalies.',
        containerClass: 'border-sky-100 bg-sky-50/75',
        badgeClass: 'border border-sky-200 bg-sky-100/80 text-sky-700',
        dotClass: 'bg-sky-500',
        barClass: 'bg-gradient-to-r from-sky-400 via-sky-500 to-sky-600',
        countBadgeClass: 'bg-sky-100 text-sky-700',
      },
      {
        key: 'businessAnalystInsights',
        title: 'Business Analyst Insight',
        description: 'Trends that impact revenue, demand, or customer mix.',
        containerClass: 'border-indigo-100 bg-indigo-50/70',
        badgeClass: 'border border-indigo-200 bg-indigo-100/80 text-indigo-700',
        dotClass: 'bg-indigo-500',
        barClass: 'bg-gradient-to-r from-indigo-400 via-indigo-500 to-indigo-600',
        countBadgeClass: 'bg-indigo-100 text-indigo-700',
      },
      {
        key: 'actionableRecommendations',
        title: 'Actionable Recommendation',
        description: 'Next steps to resolve issues or capture opportunities.',
        containerClass: 'border-emerald-100 bg-emerald-50/70',
        badgeClass: 'border border-emerald-200 bg-emerald-100/80 text-emerald-700',
        dotClass: 'bg-emerald-500',
        barClass: 'bg-gradient-to-r from-emerald-400 via-emerald-500 to-emerald-600',
        countBadgeClass: 'bg-emerald-100 text-emerald-700',
      },
    ],
    []
  );
  const handleGenerateInsights = useCallback(async (options?: { openOnSuccess?: boolean }) => {
    if (!data) return;
    if (options?.openOnSuccess) {
      setRecommendationPending(true);
    }
    setInsightBusy(true);
    setError(null);
    try {
      const payload: Record<string, string> = {};
      if (resortFilter !== "all") payload.resort = resortFilter;
      if (packageFilter !== "all") payload.package = packageFilter;
      payload.timeframe = timeframe;
      if (timeframe === "custom") {
        if (customFrom) payload.start = customFrom;
        if (customTo) payload.end = customTo;
      }
      const { data: response } = await api.post("/analytics/business-visualization/insights", payload);
      setData((prev) => (prev ? { ...prev, insights: response?.insights ?? null } : prev));
      if (options?.openOnSuccess) {
        setRecommendationModalOpen(true);
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.message || "Failed to generate insights.";
      setError(message);
    } finally {
      setInsightBusy(false);
      if (options?.openOnSuccess) {
        setRecommendationPending(false);
      }
    }
  }, [data, resortFilter, packageFilter, timeframe, customFrom, customTo]);
  const handleSeeRecommendation = useCallback(async () => {
    if (insights?.text) {
      setRecommendationModalOpen(true);
      return;
    }
    await handleGenerateInsights({ openOnSuccess: true });
  }, [insights?.text, handleGenerateInsights]);

  const handleAskReflowAgent = useCallback(async () => {
    setRecommendationModalOpen(false);
    await handleGenerateInsights({ openOnSuccess: true });
  }, [handleGenerateInsights]);

  const closeRecommendationModal = useCallback(() => {
    setRecommendationModalOpen(false);
  }, []);
  if (resolvedRole && resolvedRole !== "superadmin") {
    return (
      <main className="flex h-full items-center justify-center p-6 text-slate-600">
        Business visualization is available for super admins only.
        </main>
    );
  }
  return (
    <>
      <main className="space-y-8 p-6">
        <header className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Business Visualization</h1>
            <p className="text-sm text-slate-600">
              Monitor resort performance, riding behaviour, and package trends in one integrated view.
            </p>
            {data?.lastUpdated && (
              <div className="mt-1 text-xs text-slate-500">
                Last updated {new Date(data.lastUpdated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="secondary" className="whitespace-nowrap" disabled>
              Export CSV (coming soon)
            </Button>
          </div>
        </div>
        <div className="text-xs text-slate-500">
          Reporting Range: {data ? `${data.range.start} until ${data.range.end}` : "-"}
        </div>
        {error && <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>}
        </header>
        <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900">Analytics Filters</h2>
        <p className="text-sm text-slate-600">Focus the report by resort, package, and date range.</p>
        <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Resort</label>
            <Select value={resortFilter} onChange={(e) => setResortFilter(e.target.value)}>
              {resortOptions.map((resort) => (
                <option key={resort.id} value={resort.id}>{resort.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Package</label>
            <Select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
              {PACKAGE_OPTIONS.map((pkg) => (
                <option key={pkg.id} value={pkg.id}>{pkg.label}</option>
              ))}
            </Select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Timeframe</label>
            <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
              {TIMEFRAME_OPTIONS.map((item) => (
                <option key={item.id} value={item.id}>{item.label}</option>
              ))}
            </Select>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">From</label>
              <input
                type="date"
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
                disabled={timeframe !== "custom"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
              />
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
              <input
                type="date"
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
                disabled={timeframe !== "custom"}
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
              />
            </div>
          </div>
        </div>
        {timeframe === "custom" && (!(customFrom && customTo)) && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Provide both start and end dates to see data for this custom range.
          </div>
        )}
      </section>
      {loading && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600">
          Loading visualization data...
        </div>
      )}
      {!loading && data && (
        <>
          <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl bg-gradient-to-br from-sky-500 to-sky-600 p-4 text-white shadow-lg">
              <div className="text-xs uppercase tracking-wide text-white/80">Total rides</div>
              <div className="mt-2 text-3xl font-semibold">{formatNumber.format(data.totals.rides)}</div>
              <p className="mt-1 text-xs text-white/80">Across {formatNumber.format(data.totals.resortCount)} resort(s)</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Active riding minutes</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber.format(data.totals.minutes)}</div>
              <p className="mt-1 text-xs text-slate-500">Average session: {formatNumber.format(data.totals.averageMinutes)} minutes</p>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Gross revenue</div>
              <div className="mt-2 flex items-baseline gap-1 text-emerald-600">
                <span className="text-sm font-semibold sm:text-base">{revenueDisplay.symbol}</span>
                <span className="text-2xl font-semibold leading-tight tracking-tight text-emerald-600 whitespace-nowrap">{revenueDisplay.segments.join('.')}</span>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-slate-500">Based on cash and online transactions (extra charges included)</p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="text-xs uppercase tracking-wide text-slate-500">Package mix size</div>
              <div className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber.format(packageTotal)}</div>
              <p className="mt-1 text-xs text-slate-500">Fulfilled packages in range</p>
            </div>
          </section>
          <section className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Riding trend</h2>
                  <p className="text-sm text-slate-600">Daily movement for the selected window.</p>
                </div>
                <div className="flex gap-2">
                  <Button variant={trendMetric === "rides" ? "primary" : "secondary"} onClick={() => setTrendMetric("rides")}>
                    Rides
                  </Button>
                  <Button variant={trendMetric === "minutes" ? "primary" : "secondary"} onClick={() => setTrendMetric("minutes")}>
                    Minutes
                  </Button>
                  <Button variant={trendMetric === "revenue" ? "primary" : "secondary"} onClick={() => setTrendMetric("revenue")}>
                    Revenue
                  </Button>
                </div>
              </div>
              <div className="mt-6">
                <TrendChart
                  points={trendPoints}
                  metricLabel={metricLabel}
                  color="#0284c7"
                  valueFormatter={valueFormatter}
                />
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-3">
                {trendPoints.slice(-3).map((point) => (
                  <div key={point.label} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                    <div className="font-semibold text-slate-900">{point.label}</div>
                    <div className="mt-1 text-sm font-semibold text-slate-800">{valueFormatter(point.value)}</div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-400">Most recent daily total</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="text-lg font-semibold text-slate-900">Package composition</h2>
              <p className="text-sm text-slate-600">Distribution of fulfilled packages in the selected window.</p>
              <div className="mt-4 rounded-xl bg-slate-50 p-4">
                <PackageDistribution data={data.packages} total={packageTotal} />
              </div>
            </div>
          </section>
          <section className="grid gap-6 lg:grid-cols-5">
            <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold text-slate-900">Top performing resorts</h2>
                <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">Revenue focus</span>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-left text-sm">
                  <thead>
                    <tr className="text-slate-500">
                      <th className="px-3 py-2 font-medium">Resort</th>
                      <th className="px-3 py-2 font-medium">Rides</th>
                      <th className="px-3 py-2 font-medium">Minutes</th>
                      <th className="px-3 py-2 font-medium">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topResorts.length === 0 && (
                      <tr>
                        <td colSpan={4} className="px-3 py-6 text-center text-slate-500">No data matches the current filter selection.</td>
                      </tr>
                    )}
                    {topResorts.map((row) => (
                      <tr key={row.resortName} className="border-t border-slate-100">
                        <td className="px-3 py-2 font-semibold text-slate-900">{row.resortName}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber.format(row.rides)}</td>
                        <td className="px-3 py-2 text-slate-700">{formatNumber.format(row.minutes)}</td>
                        <td className="px-3 py-2 text-emerald-600">{formatIDR.format(row.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="relative lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              {recommendationPending && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 rounded-2xl bg-white/85 backdrop-blur-sm">
                  <svg className="h-14 w-20 text-sky-500" viewBox="0 0 64 32" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="16" cy="24" r="8" className="opacity-80">
                      <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 16 24" to="360 16 24" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <circle cx="48" cy="24" r="8" className="opacity-80">
                      <animateTransform attributeName="transform" attributeType="XML" type="rotate" from="0 48 24" to="360 48 24" dur="1s" repeatCount="indefinite" />
                    </circle>
                    <path d="M16 24L26 8h6l6 16" strokeLinecap="round" strokeLinejoin="round" className="opacity-80" />
                    <path d="M28 8h10l8 12" strokeLinecap="round" strokeLinejoin="round" className="opacity-80" />
                  </svg>
                  <p className="text-sm font-medium text-slate-600">Reflow Agent is preparing fresh insights...</p>
                </div>
              )}
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">Reflow agent recommendations</h2>
                  <p className="text-sm text-slate-600">{hasRecommendation ? 'Review tailored guidance from the Reflow Agent.' : 'Let the Reflow Agent surface operational and business recommendations for this view.'}</p>
                </div>
                {hasRecommendation && lastRecommendationLabel && (
                  <div className="text-right text-xs text-slate-500">
                    
                    <div>{lastRecommendationLabel}</div>
                  </div>
                )}
              </div>
              <div className="mt-4 space-y-4">
                {hasRecommendation ? (
                  <div className="flex flex-wrap gap-3 text-xs text-slate-600">
                    {insightSectionConfig.map(({ key, title, badgeClass }) => {
                      const count = structuredInsights ? (structuredInsights[key] || []).length : 0;
                      return (
                        <span key={key} className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 font-medium ${badgeClass}`}>
                          <span>{title}</span>
                          <span className="rounded-full bg-white/80 px-2 py-0.5 text-[10px] font-semibold text-slate-600">{count}</span>
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50/70 p-4 text-xs leading-relaxed text-slate-600">
                    No recommendations yet. Tap "See recommendation" to ask Reflow Agent for fresh analysis.
                  </div>
                )}
                {hasRecommendation && structuredInsights?.summary?.length ? (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm leading-relaxed text-slate-700">
                    {structuredInsights.summary.slice(0, 2).map((paragraph, index) => (
                      <p key={`summary-preview-${index}`} className={index > 0 ? 'mt-2' : undefined}>{paragraph}</p>
                    ))}
                    {structuredInsights.summary.length > 2 && (
                      <p className="mt-3 text-xs text-slate-500">Full narrative available in the recommendation modal.</p>
                    )}
                  </div>
                ) : null}
              </div>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button onClick={handleSeeRecommendation} disabled={!data || loading || insightBusy || recommendationPending} variant="primary">
                  See recommendation
                </Button>
                {hasRecommendation && (
                  <Button onClick={handleAskReflowAgent} loading={insightBusy} disabled={!data || loading || recommendationPending} variant="secondary">
                    Ask Reflow Agent
                  </Button>
                )}
              </div>
            </div>
          </section>
        </>
      )}
      </main>

      {recommendationModalOpen && (

        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 py-8">

          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={closeRecommendationModal} />

          <div className="relative z-10 w-full max-w-3xl max-h-[85vh] overflow-hidden rounded-3xl bg-white shadow-2xl">

            <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">

              <div>

                <h3 className="text-lg font-semibold text-slate-900">Reflow agent recommendations</h3>

                <p className="text-sm text-slate-500">{modalSubheading}</p>

              </div>

              <button

                type="button"

                onClick={closeRecommendationModal}

                className="rounded-full border border-slate-200 bg-white px-3 py-1 text-sm font-medium text-slate-600 transition hover:bg-slate-50"

              >

                Close

              </button>

            </div>

            <div className="max-h-[75vh] overflow-y-auto px-6 py-5 space-y-5 text-sm text-slate-700">

              {insights ? (

                <>

                  {structuredInsights?.summary?.length ? (

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 leading-relaxed">

                      {structuredInsights.summary.map((paragraph, index) => (

                        <p key={`modal-summary-${index}`} className={index > 0 ? 'mt-3' : undefined}>{paragraph}</p>

                      ))}

                    </div>

                  ) : null}

                  {structuredInsights && structuredInsights.hasStructuredContent ? (

                    <div className="grid gap-4 md:grid-cols-2">

                      {insightSectionConfig.map(({ key, title, description, containerClass, badgeClass, dotClass, barClass, countBadgeClass }) => {

                        const items = structuredInsights ? structuredInsights[key] : [];

                        return (

                          <div key={`modal-${key}`} className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 shadow-sm ${containerClass}`}>

                            <span className={`absolute inset-x-6 top-0 h-1 rounded-b-full ${barClass}`} />

                            <div className="flex items-start justify-between gap-3 pt-1">

                              <div>

                                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${badgeClass}`}>{title}</span>

                                <p className="mt-3 text-xs text-slate-600">{description}</p>

                              </div>

                              {items.length > 0 && (

                                <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${countBadgeClass}`}>{items.length}</span>

                              )}

                            </div>

                            {items.length > 0 ? (

                              <ul className="mt-4 space-y-3 text-sm leading-relaxed text-slate-800">

                                {items.map((item, insightIndex) => (

                                  <li key={`${key}-item-${insightIndex}`} className="flex items-start gap-3">

                                    <span className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${dotClass}`} />

                                    <span>{item}</span>

                                  </li>

                                ))}

                              </ul>

                            ) : (

                              <p className="mt-4 text-sm text-slate-500">No highlights captured for this category yet.</p>

                            )}

                          </div>

                        );

                      })}

                    </div>

                  ) : (

                    <div className="whitespace-pre-wrap rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">

                      {insights.text}

                    </div>

                  )}

                </>

              ) : (

                <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-500">

                  Ask the Reflow Agent to generate recommendations first.

                </div>

              )}

            </div>

          </div>

        </div>

      )}


    </>

  );

}



















