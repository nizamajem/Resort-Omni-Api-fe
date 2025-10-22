"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from "react";
import { useAuth } from "@/app/auth.context";
import { useRouter } from "next/navigation";
import { Select } from "@/app/components/ui/select";
import { Button } from "@/app/components/ui/button";
import { api } from "@/app/lib/api";
type PackageId = "1h" | "3h" | "12h" | "1d";
type TrendMetric = "rides" | "minutes" | "revenue";
type TrendPoint = { date: string; rides: number; minutes: number; revenue: number };
type TopResort = {
  resortName: string;
  rides: number;
  minutes: number;
  revenue: number;
  packageCounts?: Partial<Record<PackageId, number>>;
};
type InsightPayload = { text: string; generatedAt: string; source?: string; filters?: Record<string, unknown> } | null;
type InsightSectionKey = "operationalInsights" | "businessAnalystInsights" | "actionableRecommendations";
const formatIDR = new Intl.NumberFormat("id-ID", { style: "currency", currency: "IDR", maximumFractionDigits: 0 });
const formatNumber = new Intl.NumberFormat("id-ID");
const extractErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === "string" && error.trim().length > 0) {
    return error;
  }
  if (error && typeof error === "object") {
    const maybeResponse = (error as { response?: { data?: { error?: string } } }).response;
    if (maybeResponse?.data?.error && typeof maybeResponse.data.error === "string") {
      return maybeResponse.data.error;
    }
    if ("message" in error && typeof (error as { message?: unknown }).message === "string") {
      return (error as { message: string }).message;
    }
  }
  return fallback;
};
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
const METRIC_TABS: { id: TrendMetric; label: string }[] = [
  { id: "rides", label: "Rides" },
  { id: "minutes", label: "Minutes" },
  { id: "revenue", label: "Revenue" },
];
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
function TrendChart({ points, metricLabel, color, valueFormatter }: TrendChartProps) {
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [containerWidth, setContainerWidth] = useState(360);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const gradientId = useMemo(() => `trend-gradient-${Math.random().toString(36).slice(2)}`, []);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry?.contentRect?.width) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const hasData = points.length > 0;
  const height = 160;
  const chartPadding = 16;
  const chartTopPadding = 12;
  const chartBottomPadding = 32;
  const minimumStep = 56;
  const chartHeight = Math.max(height - chartTopPadding - chartBottomPadding, 80);
  const baselineY = chartTopPadding + chartHeight;
  const requiredEffectiveWidth = Math.max((points.length - 1) * minimumStep, 0);
  const effectiveWidth = Math.max(containerWidth - chartPadding * 2, Math.max(requiredEffectiveWidth, 120));
  const step = points.length > 1 ? effectiveWidth / (points.length - 1) : 0;
  const width = chartPadding * 2 + effectiveWidth;
  const values = points.map((point) => point.value);
  const maxValue = values.length ? Math.max(...values) : 1;
  const minValue = values.length ? Math.min(...values) : 0;
  const span = maxValue - minValue || 1;
  const coordinates = points.map((point, index) => {
    const norm = (point.value - minValue) / span;
    const x = chartPadding + (points.length > 1 ? index * step : effectiveWidth / 2);
    const y = chartTopPadding + chartHeight - norm * chartHeight;
    return { point, x, y };
  });
  const hoverData = hoverIndex !== null ? coordinates[hoverIndex] : null;
  const tooltipLeft = useMemo(() => {
    if (!hoverData) return null;
    const TOOLTIP_WIDTH = 184;
    const half = TOOLTIP_WIDTH / 2;
    const min = chartPadding + half;
    const max = chartPadding + effectiveWidth - half;
    if (min > max) return chartPadding + effectiveWidth / 2;
    return Math.max(min, Math.min(max, hoverData.x));
  }, [hoverData, chartPadding, effectiveWidth]);
  const scrollToCoordinate = useCallback(
    (x: number) => {
      const wrapper = scrollRef.current;
      if (!wrapper) return;
      const visibleWidth = wrapper.clientWidth;
      const maxScroll = Math.max(0, wrapper.scrollWidth - visibleWidth);
      const target = Math.min(maxScroll, Math.max(0, x - visibleWidth / 2));
      wrapper.scrollTo({ left: target, behavior: "smooth" });
    },
    []
  );
  const handlePointer = (event: ReactMouseEvent<SVGSVGElement> | ReactTouchEvent<SVGSVGElement>) => {
    if (!hasData) return;
    const clientX = "touches" in event ? event.touches[0]?.clientX : event.clientX;
    const target = event.currentTarget.getBoundingClientRect();
    const relativeX = Math.min(Math.max(clientX - target.left, 0), target.width);
    const scale = width / target.width;
    const pointerX = relativeX * scale;
    const clamped = Math.min(Math.max(pointerX - chartPadding, 0), effectiveWidth);
    const index = points.length > 1 && step > 0 ? Math.round(clamped / step) : 0;
    const nextIndex = Math.min(points.length - 1, Math.max(0, index));
    setHoverIndex(nextIndex);
    scrollToCoordinate(chartPadding + (points.length > 1 ? nextIndex * step : effectiveWidth / 2));
  };
  return (
    <div ref={containerRef} className="space-y-3">
      <div ref={scrollRef} className="overflow-x-auto">
        <div
          className="relative overflow-hidden rounded-xl border border-slate-200 bg-white"
          onMouseLeave={() => setHoverIndex(null)}
          style={{ minWidth: `${width}px` }}
        >
          <svg
            viewBox={`0 0 ${width} ${height}`}
            style={{ width: `${width}px`, height: `${height}px` }}
            onMouseMove={handlePointer}
            onTouchMove={handlePointer}
            onTouchStart={handlePointer}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.35" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            {hasData ? (
              <>
                <polygon
                  points={`${coordinates.map(({ x, y }) => `${x},${y}`).join(" ")} ${chartPadding + effectiveWidth},${baselineY} ${chartPadding},${baselineY}`}
                  fill={`url(#${gradientId})`}
                />
                <polyline
                  points={coordinates.map(({ x, y }) => `${x},${y}`).join(" ")}
                  fill="none"
                  stroke={color}
                  strokeWidth={3}
                  strokeLinecap="round"
                />
                {coordinates.map(({ point, x, y }, index) => {
                  const isActive = index === hoverIndex;
                  return (
                    <circle
                      key={point.raw.date ?? `${point.label}-${index}`}
                      cx={x}
                      cy={y}
                      r={isActive ? 5 : 3}
                      fill={isActive ? color : "#ffffff"}
                      stroke={color}
                      strokeWidth={isActive ? 2 : 1.5}
                      onMouseEnter={() => {
                        setHoverIndex(index);
                        scrollToCoordinate(x);
                      }}
                      onFocus={() => {
                        setHoverIndex(index);
                        scrollToCoordinate(x);
                      }}
                    />
                  );
                })}
              </>
            ) : null}
          </svg>
          {hoverData && tooltipLeft !== null && (
            <div
              className="pointer-events-none absolute top-3 w-44 -translate-x-1/2 rounded-lg border border-slate-200 bg-white/95 px-3 py-2 text-xs shadow-lg backdrop-blur"
              style={{ left: `${tooltipLeft}px` }}
            >
              <div className="font-semibold text-slate-900">{hoverData.point.label}</div>
              <div className="mt-1 text-slate-600">{valueFormatter(hoverData.point.value)} {metricLabel}</div>
            </div>
          )}
        </div>
        <div className="relative h-10 border-t border-slate-200 pt-2 text-xs text-slate-500" style={{ minWidth: `${width}px` }}>
          {coordinates.map(({ point, x }, index) => (
            <span
              key={point.raw.date ?? `${point.label}-${index}`}
              className="absolute left-0 top-0 flex w-16 -translate-x-1/2 flex-col items-center gap-1 text-[11px] font-medium text-slate-500"
              style={{
                left: `${(x / width) * 100}%`,
              }}
            >
              <span className="block h-[3px] w-[3px] rounded-full bg-sky-500" />
              <span>{point.label}</span>
            </span>
          ))}
        </div>
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
    } catch (error) {
      const message = extractErrorMessage(error, "Failed to load analytics data.");
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
    const sortedTrend = [...data.trend].sort((a, b) => {
      const left = new Date(a.date).getTime();
      const right = new Date(b.date).getTime();
      return left - right;
    });
    return sortedTrend.map((point) => ({
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
    } catch (error) {
      const message = extractErrorMessage(error, "Failed to generate insights.");
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

  const handleExportPdf = useCallback(async () => {
    if (typeof window === "undefined") return;
    if (!data) return;
    const { default: jsPDF } = await import("jspdf");
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginX = 14;
    const marginBottom = 16;
    const availableWidth = pageWidth - marginX * 2;
    let cursorY = 22;
    const ensureSpace = (heightNeeded: number) => {
      if (cursorY + heightNeeded > pageHeight - marginBottom) {
        doc.addPage();
        cursorY = 22;
      }
    };
    const addSpacer = (height: number) => {
      cursorY += height;
    };
    const addTitle = (title: string, subtitle?: string) => {
      ensureSpace(subtitle ? 16 : 12);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(15, 23, 42);
      doc.text(title, marginX, cursorY);
      if (subtitle) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(11);
        doc.setTextColor(71, 85, 105);
        doc.text(subtitle, marginX, cursorY + 7);
        cursorY += 12;
      } else {
        cursorY += 10;
      }
    };
    const addSectionHeading = (text: string) => {
      ensureSpace(10);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(30, 41, 59);
      doc.text(text, marginX, cursorY);
      cursorY += 7;
      doc.setDrawColor(148, 163, 184);
      doc.setLineWidth(0.3);
      doc.line(marginX, cursorY, marginX + 40, cursorY);
      cursorY += 5;
    };
    const addParagraph = (text: string) => {
      if (!text) return;
      const lines = doc.splitTextToSize(text, availableWidth);
      lines.forEach((line) => {
        ensureSpace(6);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(71, 85, 105);
        doc.text(line, marginX, cursorY);
        cursorY += 5;
      });
      cursorY += 2;
    };
    const addKpiCards = (
      cards: Array<{ label: string; value: string; detail?: string; accent?: [number, number, number] }>,
    ) => {
      if (!cards.length) return;
      const cardGap = 6;
      const columns = 2;
      const cardWidth = (availableWidth - cardGap) / columns;
      const cardHeight = 26;
      cards.forEach((card, index) => {
        const column = index % columns;
        if (column === 0) ensureSpace(cardHeight + cardGap);
        const x = marginX + column * (cardWidth + cardGap);
        const accent = card.accent ?? [14, 116, 144];
        doc.setDrawColor(accent[0], accent[1], accent[2]);
        doc.setFillColor(248, 250, 252);
        doc.roundedRect(x, cursorY, cardWidth, cardHeight, 2, 2, "FD");
        doc.setFillColor(accent[0], accent[1], accent[2]);
        doc.roundedRect(x, cursorY, 3, cardHeight, 1.5, 0, "F");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(71, 85, 105);
        doc.text(card.label.toUpperCase(), x + 6, cursorY + 7);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(14);
        doc.setTextColor(15, 23, 42);
        doc.text(card.value, x + 6, cursorY + 16);
        if (card.detail) {
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(100, 116, 139);
          const detailLines = doc.splitTextToSize(card.detail, cardWidth - 12);
          detailLines.forEach((line, idx) => {
            doc.text(line, x + 6, cursorY + 20 + idx * 4);
          });
        }
        if (column === columns - 1 || index === cards.length - 1) {
          cursorY += cardHeight + cardGap;
        }
      });
      cursorY += 4;
    };
    type TableColumn = { header: string; widthRatio: number; align?: "left" | "center" | "right" };
    const addTable = (title: string, columns: TableColumn[], rows: string[][], note?: string) => {
      if (!rows.length) return;
      addSectionHeading(title);
      const headerHeight = 8;
      const rowHeight = 7;
      const tableWidth = availableWidth;
      ensureSpace(headerHeight + rowHeight * rows.length + (note ? 12 : 4));
      doc.setDrawColor(203, 213, 225);
      doc.setFillColor(226, 232, 240);
      let x = marginX;
      columns.forEach((column) => {
        const columnWidth = column.widthRatio * tableWidth;
        doc.rect(x, cursorY, columnWidth, headerHeight, "FD");
        doc.setFont("helvetica", "bold");
        doc.setFontSize(9);
        doc.setTextColor(51, 65, 85);
        const headerX =
          column.align === "right"
            ? x + columnWidth - 2
            : column.align === "center"
            ? x + columnWidth / 2
            : x + 2;
        doc.text(column.header, headerX, cursorY + 5.5, { align: column.align ?? "left" });
        x += columnWidth;
      });
      cursorY += headerHeight;
      rows.forEach((cells) => {
        ensureSpace(rowHeight);
        x = marginX;
        columns.forEach((column, index) => {
          const columnWidth = column.widthRatio * tableWidth;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(9);
          doc.setTextColor(71, 85, 105);
          const cellValue = cells[index] ?? "";
          const alignX =
            column.align === "right"
              ? x + columnWidth - 2
              : column.align === "center"
              ? x + columnWidth / 2
              : x + 2;
          doc.text(cellValue, alignX, cursorY + 4.5, { align: column.align ?? "left" });
          doc.setDrawColor(226, 232, 240);
          doc.rect(x, cursorY, columnWidth, rowHeight);
          x += columnWidth;
        });
        cursorY += rowHeight;
      });
      if (note) {
        doc.setFont("helvetica", "italic");
        doc.setFontSize(8);
        doc.setTextColor(148, 163, 184);
        cursorY += 4;
        const noteLines = doc.splitTextToSize(note, availableWidth);
        noteLines.forEach((line) => {
          ensureSpace(5);
          doc.text(line, marginX, cursorY);
          cursorY += 4;
        });
      } else {
        cursorY += 4;
      }
    };
    const addBullets = (title: string, items: string[]) => {
      if (!items.length) return;
      addSectionHeading(title);
      items.forEach((item) => {
        ensureSpace(6);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.setTextColor(14, 116, 144);
        doc.text("•", marginX, cursorY);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(71, 85, 105);
        const textLines = doc.splitTextToSize(item, availableWidth - 8);
        textLines.forEach((line, idx) => {
          doc.text(line, marginX + 6, cursorY + idx * 5);
        });
        cursorY += textLines.length * 5 + 2;
      });
      cursorY += 2;
    };
    const titleSubtitle = `Filters · Resorts: ${
      data.filters.resorts.length ? data.filters.resorts.join(", ") : "All"
    } · Packages: ${data.filters.packages.length ? data.filters.packages.join(", ") : "All"} · ${
      data.range.timeframeDays
    } day window`;
    addTitle("Business Performance Briefing", titleSubtitle);
    const revenueSegments = formatCurrencySegments(data.totals.revenue);
    const revenueValue = `${revenueSegments.symbol} ${revenueSegments.segments.join(".")}`;
    addKpiCards([
      { label: "Total Rides", value: formatNumber.format(data.totals.rides), detail: "Completed sessions" },
      { label: "Gross Revenue", value: revenueValue, detail: "Inclusive of cash & online" },
      {
        label: "Active Minutes",
        value: formatNumber.format(data.totals.minutes),
        detail: `Average session ${formatNumber.format(data.totals.averageMinutes)} mins`,
      },
      {
        label: "Resort Footprint",
        value: formatNumber.format(data.totals.resortCount),
        detail: "Operational locations in range",
      },
    ]);
    const packagesEntries = (Object.keys(data.packages) as PackageId[])
      .map((pkg) => ({ id: pkg, value: data.packages[pkg] || 0 }))
      .sort((a, b) => b.value - a.value);
    addTable(
      "Package Mix",
      [
        { header: "Package", widthRatio: 0.45 },
        { header: "Fulfilled Rides", widthRatio: 0.55, align: "right" },
      ],
      packagesEntries.map(({ id, value }) => [
        id.toUpperCase(),
        formatNumber.format(value),
      ]),
    );
    const sortedTrend = [...data.trend].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const trendWindow = 12;
    const trimmedTrend = sortedTrend.slice(-trendWindow);
    addTable(
      "Daily Trend Snapshot",
      [
        { header: "Date", widthRatio: 0.34 },
        { header: "Rides", widthRatio: 0.22, align: "right" },
        { header: "Minutes", widthRatio: 0.22, align: "right" },
        { header: "Revenue", widthRatio: 0.22, align: "right" },
      ],
      trimmedTrend.map((point) => [
        new Date(point.date).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        formatNumber.format(point.rides),
        formatNumber.format(point.minutes),
        formatIDR.format(point.revenue),
      ]),
      sortedTrend.length > trendWindow ? "Showing the most recent 12 days of activity." : undefined,
    );
    const resortRows = data.topResorts.map((resort, rank) => {
      const packageCounts = resort.packageCounts ?? {};
      return [
        `#${rank + 1} ${resort.resortName}`,
        formatIDR.format(resort.revenue),
        formatNumber.format(resort.rides),
        formatNumber.format(resort.minutes),
        `${formatNumber.format(packageCounts["1h"] ?? 0)}/${formatNumber.format(
          packageCounts["3h"] ?? 0,
        )}/${formatNumber.format(packageCounts["12h"] ?? 0)}/${formatNumber.format(packageCounts["1d"] ?? 0)}`,
      ];
    });
    addTable(
      "Top Performing Resorts",
      [
        { header: "Resort", widthRatio: 0.34 },
        { header: "Revenue", widthRatio: 0.22, align: "right" },
        { header: "Rides", widthRatio: 0.15, align: "right" },
        { header: "Minutes", widthRatio: 0.15, align: "right" },
        { header: "Pkg 1h/3h/12h/1d", widthRatio: 0.14, align: "right" },
      ],
      resortRows,
    );
    ensureSpace(12);
    const generatedStamp = new Date().toLocaleString("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    });
    doc.setFont("helvetica", "italic");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(`Generated on ${generatedStamp}`, marginX, cursorY);
    cursorY += 4;
    doc.text("Powered by Business Visualization Dashboard", marginX, cursorY);
    const fileName = `business-visualization-${data.range.start}-to-${data.range.end}.pdf`;
    doc.save(fileName);
  }, [data, structuredInsights, insights?.text]);

  const closeRecommendationModal = useCallback(() => {
    setRecommendationModalOpen(false);
  }, []);
  if (resolvedRole && resolvedRole !== "superadmin") {
    return (
      <main className="flex min-h-[50vh] items-center justify-center bg-slate-50 p-6 text-slate-600">
        Business visualization is available for super admins only.
      </main>
    );
  }
  return (
    <>
      <main className="min-h-screen bg-slate-100 p-6">
        <div className="mx-auto max-w-7xl space-y-6">
        <header className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold text-slate-900">Business Visualization</h1>
              <p className="text-sm text-slate-600">
                Monitor resort performance, riding behaviour, and package trends in one integrated view.
              </p>
              {data?.lastUpdated && (
                <div className="mt-1 text-xs text-slate-500">
                  Last updated{" "}
                  {new Date(data.lastUpdated).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                </div>
              )}
            </div>
            <div className="flex gap-2">
              {/* <Button
                variant="primary"
                onClick={handleSeeRecommendation}
                loading={insightBusy || recommendationPending}
                disabled={!data || loading}
                className="whitespace-nowrap"
              >
                See recommendation
              </Button> */}
              <Button
                variant="primary"
                className="whitespace-nowrap"
                onClick={handleExportPdf}
                disabled={!data || loading}
              >
                Export PDF
              </Button>
            </div>
          </div>
          <div className="text-xs text-slate-500">
            Reporting Range: {data ? `${data.range.start} until ${data.range.end}` : "-"}
          </div>
          {error && (
            <div className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200">{error}</div>
          )}
        </header>
        <section className="rounded-3xl border border-slate-200 bg-white/95 p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Analytics Filters</h2>
          <p className="text-sm text-slate-600">Focus the report by resort, package, and date range.</p>
          <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Resort</label>
              <Select value={resortFilter} onChange={(e) => setResortFilter(e.target.value)}>
                {resortOptions.map((resort) => (
                  <option key={resort.id} value={resort.id}>
                    {resort.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Package</label>
              <Select value={packageFilter} onChange={(e) => setPackageFilter(e.target.value)}>
                {PACKAGE_OPTIONS.map((pkg) => (
                  <option key={pkg.id} value={pkg.id}>
                    {pkg.label}
                  </option>
                ))}
              </Select>
            </div>
            <div>
              <label className="text-xs font-medium uppercase tracking-wide text-slate-500">Timeframe</label>
              <Select value={timeframe} onChange={(e) => setTimeframe(e.target.value)}>
                {TIMEFRAME_OPTIONS.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
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
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
                />
              </div>
              <div>
                <label className="text-xs font-medium uppercase tracking-wide text-slate-500">To</label>
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  disabled={timeframe !== "custom"}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-100"
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
          <div className="rounded-3xl border border-slate-200 bg-white p-6 text-center text-sm text-slate-600 shadow-sm">
            Loading visualization data...
          </div>
        )}
        {!loading && data && (
          <>
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-3xl bg-gradient-to-br from-sky-500 to-sky-600 p-5 text-white shadow-md ring-1 ring-sky-500/30">
                <div className="text-xs uppercase tracking-wide text-white/80">Total rides</div>
                <div className="mt-2 text-3xl font-semibold">{formatNumber.format(data.totals.rides)}</div>
                <p className="mt-1 text-xs text-white/80">
                  Across {formatNumber.format(data.totals.resortCount)} resort(s)
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">Active riding minutes</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">
                  {formatNumber.format(data.totals.minutes)}
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Average session: {formatNumber.format(data.totals.averageMinutes)} minutes
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Gross revenue</div>
                <div className="mt-2 flex items-baseline gap-1 text-emerald-600">
                  <span className="text-sm font-semibold sm:text-base">{revenueDisplay.symbol}</span>
                  <span className="text-2xl font-semibold leading-tight tracking-tight text-emerald-600 whitespace-nowrap">
                    {revenueDisplay.segments.join(".")}
                  </span>
                </div>
                <p className="mt-2 text-[11px] leading-relaxed text-slate-500">
                  Based on cash and online transactions (extra charges included)
                </p>
              </div>
              <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="text-xs uppercase tracking-wide text-slate-500">Package mix size</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{formatNumber.format(packageTotal)}</div>
                <p className="mt-1 text-xs text-slate-500">Fulfilled packages in range</p>
              </div>
            </section>
            <section className="grid gap-6 lg:grid-cols-1">
              <div className="lg:col-span-2 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-900">Riding trend</h2>
                    <p className="text-sm text-slate-600">Daily movement for the selected window.</p>
                  </div>
                  <div className="rounded-full bg-slate-100 p-1">
                    <div className="flex gap-1">
                      {METRIC_TABS.map((tab) => {
                        const active = trendMetric === tab.id;
                        return (
                          <button
                            key={tab.id}
                            type="button"
                            onClick={() => setTrendMetric(tab.id)}
                            className={`rounded-full px-3 py-1.5 text-sm font-medium transition focus:outline-none focus-visible:ring-2 ${
                              active
                                ? "bg-white text-sky-600 shadow-sm focus-visible:ring-sky-500"
                                : "text-slate-500 hover:text-slate-700 focus-visible:ring-sky-400/70"
                            }`}
                          >
                            {tab.label}
                          </button>
                        );
                      })}
                    </div>
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
                    <div
                      key={point.raw.date ?? point.label}
                      className="rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-600 shadow-sm"
                    >
                      <div className="font-semibold text-slate-900">{point.label}</div>
                      <div className="mt-1 text-sm font-semibold text-slate-800">{valueFormatter(point.value)}</div>
                      <div className="text-[11px] uppercase tracking-wide text-slate-400">Most recent daily total</div>
                    </div>
                  ))}
                </div>
              </div>
          </section>
            <section className="grid gap-6 lg:grid-cols-2">
              <div className="lg:col-span-3 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="text-lg font-semibold text-slate-900">Top performing resorts</h2>
                  <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-medium text-sky-700">
                    Revenue focus
                  </span>
                </div>
                <div className="mt-4 overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead>
                      <tr className="text-slate-500">
                        <th className="px-3 py-2 font-medium">Resort</th>
                        <th className="px-3 py-2 font-medium">Rides</th>
                        <th className="px-3 py-2 font-medium">1 Hour Packages</th>
                        <th className="px-3 py-2 font-medium">3 Hour Packages</th>
                        <th className="px-3 py-2 font-medium">12 Hour Packages</th>
                        <th className="px-3 py-2 font-medium">Minutes</th>
                        <th className="px-3 py-2 font-medium">Revenue</th>
                      </tr>
                    </thead>
                    <tbody>
                      {topResorts.length === 0 && (
                        <tr>
                          <td colSpan={7} className="px-3 py-6 text-center text-slate-500">
                            No data matches the current filter selection.
                          </td>
                        </tr>
                      )}
                      {topResorts.map((row) => {
                        const packageCounts = row.packageCounts ?? ({} as Partial<Record<PackageId, number>>);
                        return (
                          <tr key={row.resortName} className="border-t border-slate-100">
                            <td className="px-3 py-2 font-semibold text-slate-900">{row.resortName}</td>
                            <td className="px-3 py-2 text-slate-700">{formatNumber.format(row.rides)}</td>
                            <td className="px-3 py-2 text-slate-700">
                              {formatNumber.format(packageCounts["1h"] ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {formatNumber.format(packageCounts["3h"] ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-slate-700">
                              {formatNumber.format(packageCounts["12h"] ?? 0)}
                            </td>
                            <td className="px-3 py-2 text-slate-700">{formatNumber.format(row.minutes)}</td>
                            <td className="px-3 py-2 text-emerald-600">{formatIDR.format(row.revenue)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          </>
        )}
        </div>
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



















