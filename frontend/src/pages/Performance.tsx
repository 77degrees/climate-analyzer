import { useEffect, useState } from "react";
import {
  Timer,
  Gauge,
  Target,
  Award,
  RefreshCw,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ScatterChart,
  Scatter,
  ZAxis,
} from "recharts";
import { StatCard } from "@/components/shared/StatCard";
import { Card } from "@/components/ui/card";
import { TimeRangeSelector } from "@/components/shared/TimeRangeSelector";
import {
  getRecoveryEvents,
  getDutyCycle,
  getMetricsSummary,
  type RecoveryEvent,
  type DutyCycleDay,
  type MetricsSummary,
} from "@/lib/api";

const DAYS_MAP: Record<number, number> = {
  24: 1, 168: 7, 720: 30, 2: 1, 6: 1,
};

export default function Performance() {
  const [hours, setHours] = useState(168);
  const [summary, setSummary] = useState<MetricsSummary | null>(null);
  const [recovery, setRecovery] = useState<RecoveryEvent[]>([]);
  const [dutyCycle, setDutyCycle] = useState<DutyCycleDay[]>([]);
  const [loading, setLoading] = useState(true);

  const days = DAYS_MAP[hours] || Math.ceil(hours / 24);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [s, r, d] = await Promise.all([
        getMetricsSummary(days),
        getRecoveryEvents(days),
        getDutyCycle(days),
      ]);
      setSummary(s);
      setRecovery(r);
      setDutyCycle(d);
    } catch (e) {
      console.error("Failed to fetch performance data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [hours]);

  const scoreColor =
    (summary?.efficiency_score ?? 0) >= 75
      ? "success"
      : (summary?.efficiency_score ?? 0) >= 50
        ? "warning"
        : "destructive";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl font-bold">Performance</h1>
        <div className="flex items-center gap-3">
          <TimeRangeSelector value={hours} onChange={setHours} />
          <button
            onClick={fetchData}
            className="flex items-center gap-2 rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Avg Recovery Time"
          value={summary ? `${summary.avg_recovery_minutes} min` : "--"}
          icon={Timer}
          borderColor="#06b6d4"
        />
        <StatCard
          title="Duty Cycle"
          value={summary ? `${summary.duty_cycle_pct}%` : "--"}
          subtitle="Heating + Cooling"
          icon={Gauge}
          borderColor="#f59e0b"
        />
        <StatCard
          title="Hold Efficiency"
          value={summary ? `±${summary.hold_efficiency}°F` : "--"}
          subtitle="Avg drift from setpoint"
          icon={Target}
          borderColor="#8b5cf6"
        />
        <StatCard
          title="Efficiency Score"
          value={summary ? `${summary.efficiency_score}` : "--"}
          subtitle="Out of 100"
          subtitleColor={scoreColor as any}
          icon={Award}
          borderColor="#10b981"
        />
      </div>

      {/* Recovery Times Chart */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Recovery Events
        </h2>
        <div className="h-72">
          {recovery.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={recovery}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                <XAxis
                  dataKey="start_time"
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  tickFormatter={(v) =>
                    new Date(v).toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    })
                  }
                />
                <YAxis
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  label={{
                    value: "Minutes",
                    angle: -90,
                    position: "insideLeft",
                    fill: "hsl(215, 15%, 55%)",
                    fontSize: 11,
                  }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 41%, 8%)",
                    border: "1px solid hsl(222, 20%, 18%)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(value: number, name: string) => [
                    `${value} min`,
                    "Duration",
                  ]}
                  labelFormatter={(label) =>
                    new Date(label).toLocaleString()
                  }
                />
                <Bar dataKey="duration_minutes" radius={[4, 4, 0, 0]}>
                  {recovery.map((entry, idx) => (
                    <Cell
                      key={idx}
                      fill={entry.action === "heating" ? "#f97316" : "#3b82f6"}
                      opacity={entry.success ? 1 : 0.5}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No recovery events in this period"}
            </div>
          )}
        </div>
      </Card>

      {/* Duty Cycle Stacked Bar */}
      <Card className="p-5">
        <h2 className="mb-4 font-display text-sm font-semibold text-foreground">
          Daily Duty Cycle
        </h2>
        <div className="h-64">
          {dutyCycle.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dutyCycle}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(222, 20%, 18%)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  tickFormatter={(v) => {
                    const d = new Date(v + "T00:00:00");
                    return d.toLocaleDateString([], {
                      month: "short",
                      day: "numeric",
                    });
                  }}
                />
                <YAxis
                  domain={[0, 100]}
                  tick={{ fill: "hsl(215, 15%, 55%)", fontSize: 11 }}
                  stroke="hsl(222, 20%, 18%)"
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "hsl(222, 41%, 8%)",
                    border: "1px solid hsl(222, 20%, 18%)",
                    borderRadius: "8px",
                    fontSize: 12,
                  }}
                  formatter={(v: number) => `${v}%`}
                />
                <Bar
                  dataKey="heating_pct"
                  name="Heating"
                  stackId="a"
                  fill="#f97316"
                />
                <Bar
                  dataKey="cooling_pct"
                  name="Cooling"
                  stackId="a"
                  fill="#3b82f6"
                />
                <Bar
                  dataKey="idle_pct"
                  name="Idle"
                  stackId="a"
                  fill="#6b7280"
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              {loading ? "Loading..." : "No duty cycle data"}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
