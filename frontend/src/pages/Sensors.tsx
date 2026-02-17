import { useEffect, useState, useMemo } from "react";
import {
  Search,
  RefreshCw,
  Thermometer,
  Droplets,
  Wind,
  Gauge,
  Eye,
  EyeOff,
  TreePine,
  Home,
  Plus,
  Trash2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getSensorsWithZones,
  getLiveStates,
  updateSensor,
  discoverSensors,
  getZones,
  createZone,
  deleteZone,
  type SensorWithZone,
  type LiveState,
  type Zone,
} from "@/lib/api";

type FilterCategory = "all" | "climate" | "temperature" | "humidity" | "air_quality" | "pressure" | "other";

const CATEGORY_FILTERS: Record<FilterCategory, { label: string; match: (s: SensorWithZone) => boolean }> = {
  all: { label: "All", match: () => true },
  climate: { label: "HVAC / Climate", match: (s) => s.domain === "climate" },
  temperature: { label: "Temperature", match: (s) => s.device_class === "temperature" && s.domain === "sensor" },
  humidity: { label: "Humidity", match: (s) => s.device_class === "humidity" },
  air_quality: {
    label: "Air Quality",
    match: (s) =>
      ["aqi", "carbon_dioxide", "carbon_monoxide", "pm1", "pm25", "pm10", "pm100",
        "volatile_organic_compounds", "volatile_organic_compounds_parts",
        "nitrogen_dioxide", "ozone", "sulphur_dioxide"].includes(s.device_class || "")
      || s.domain === "air_quality",
  },
  pressure: {
    label: "Pressure / Wind",
    match: (s) => ["atmospheric_pressure", "pressure", "wind_speed", "dewpoint"].includes(s.device_class || ""),
  },
  other: {
    label: "Other",
    match: (s) => s.domain === "weather" || s.domain === "fan",
  },
};

const DEVICE_CLASS_ICONS: Record<string, typeof Thermometer> = {
  temperature: Thermometer,
  humidity: Droplets,
  atmospheric_pressure: Gauge,
  pressure: Gauge,
  wind_speed: Wind,
  aqi: Wind,
  carbon_dioxide: Wind,
};

const PLATFORM_LABELS: Record<string, string> = {
  nest: "Nest",
  badnest: "Nest (Custom)",
  ecobee: "Ecobee",
  switchbot: "SwitchBot",
  switchbot_cloud: "SwitchBot",
  tuya: "Tuya",
  mqtt: "MQTT",
  zha: "Zigbee (ZHA)",
  zwave_js: "Z-Wave",
  homekit_controller: "HomeKit",
  smartthings: "SmartThings",
  smartthinq_sensors: "LG ThinQ",
  honeywell: "Honeywell",
  tplink: "TP-Link",
  shelly: "Shelly",
  esphome: "ESPHome",
  xiaomi_miio: "Xiaomi",
  broadlink: "Broadlink",
  eight_sleep: "Eight Sleep",
  sensibo: "Sensibo",
  vesync: "VeSync",
  enphase_envoy: "Enphase",
  weatherdotcom: "Weather.com",
  met: "Met.no",
  nws: "NWS",
};

const PLATFORM_COLORS: Record<string, string> = {
  nest: "#4285F4",
  badnest: "#4285F4",
  ecobee: "#00B259",
  switchbot: "#F44336",
  switchbot_cloud: "#F44336",
  tuya: "#FF6D00",
  mqtt: "#660099",
  zha: "#FFB300",
  esphome: "#01A9DB",
  eight_sleep: "#1E88E5",
  homekit_controller: "#999",
  smartthings: "#15BEF0",
  smartthinq_sensors: "#A50034",
  vesync: "#00C853",
  enphase_envoy: "#F37321",
  weatherdotcom: "#2196F3",
  met: "#2979FF",
};

function getPlatformLabel(platform: string | null | undefined): string {
  if (!platform) return "";
  return PLATFORM_LABELS[platform] || platform.replace(/_/g, " ");
}

function getPlatformColor(platform: string | null | undefined): string {
  if (!platform) return "#555";
  return PLATFORM_COLORS[platform] || "#555";
}

function timeAgo(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const then = new Date(isoString).getTime();
  const now = Date.now();
  const diffS = Math.floor((now - then) / 1000);
  if (diffS < 0 || isNaN(diffS)) return "";
  if (diffS < 60) return "just now";
  const diffM = Math.floor(diffS / 60);
  if (diffM < 60) return `${diffM}m ago`;
  const diffH = Math.floor(diffM / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 30) return `${diffD}d ago`;
  return `${Math.floor(diffD / 30)}mo ago`;
}

function getStatusColor(state: string | undefined): string {
  if (!state) return "text-muted-foreground";
  if (state === "unavailable" || state === "unknown") return "text-muted-foreground/50";
  return "text-foreground";
}

function getActionBadge(action: string | null) {
  if (!action) return null;
  const colors: Record<string, string> = {
    heating: "bg-orange-500",
    cooling: "bg-blue-500",
    idle: "bg-gray-500",
    off: "bg-gray-700",
  };
  return (
    <span className={cn("rounded px-1.5 py-0.5 text-[10px] font-bold uppercase text-white", colors[action] || "bg-gray-600")}>
      {action}
    </span>
  );
}

export default function Sensors() {
  const [sensors, setSensors] = useState<SensorWithZone[]>([]);
  const [liveStates, setLiveStates] = useState<Record<string, LiveState>>({});
  const [zones, setZones] = useState<Zone[]>([]);
  const [filter, setFilter] = useState<FilterCategory>("all");
  const [platformFilter, setPlatformFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [discovering, setDiscovering] = useState(false);
  const [loading, setLoading] = useState(true);
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneColor, setNewZoneColor] = useState("#06b6d4");
  const [showZonePanel, setShowZonePanel] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [s, z, live] = await Promise.all([
        getSensorsWithZones(),
        getZones(),
        getLiveStates(),
      ]);
      setSensors(s);
      setZones(z);
      setLiveStates(live);
    } catch (e) {
      console.error("Failed to load sensors:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverSensors();
      await loadData();
      alert(`Discovered ${result.discovered} new sensors`);
    } catch (e) {
      alert(`Discovery failed: ${e}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSensorUpdate = async (id: number, updates: Partial<SensorWithZone>) => {
    await updateSensor(id, updates);
    const s = await getSensorsWithZones();
    setSensors(s);
  };

  const handleCreateZone = async () => {
    if (!newZoneName.trim()) return;
    await createZone({ name: newZoneName.trim(), color: newZoneColor });
    setNewZoneName("");
    const z = await getZones();
    setZones(z);
  };

  const handleDeleteZone = async (id: number) => {
    if (!confirm("Delete this zone? Sensors will be unassigned.")) return;
    await deleteZone(id);
    const [z, s] = await Promise.all([getZones(), getSensorsWithZones()]);
    setZones(z);
    setSensors(s);
  };

  // Unique platforms for filter
  const platforms = useMemo(() => {
    const p = new Set<string>();
    sensors.forEach((s) => { if (s.platform) p.add(s.platform); });
    return Array.from(p).sort();
  }, [sensors]);

  // Filter + search
  const filtered = useMemo(() => {
    return sensors.filter((s) => {
      if (!CATEGORY_FILTERS[filter].match(s)) return false;
      if (platformFilter !== "all" && s.platform !== platformFilter) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        return (
          s.entity_id.toLowerCase().includes(q) ||
          s.friendly_name.toLowerCase().includes(q) ||
          (s.device_class || "").toLowerCase().includes(q) ||
          (s.platform || "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sensors, filter, platformFilter, searchQuery]);

  // Category counts
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const key of Object.keys(CATEGORY_FILTERS) as FilterCategory[]) {
      c[key] = sensors.filter(CATEGORY_FILTERS[key].match).length;
    }
    return c;
  }, [sensors]);

  const trackedCount = sensors.filter((s) => s.is_tracked).length;
  const outdoorCount = sensors.filter((s) => s.is_outdoor).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl font-bold">Sensors</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {sensors.length} entities · {trackedCount} tracked · {outdoorCount} outdoor
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowZonePanel(!showZonePanel)}
            className="rounded-lg bg-secondary px-3 py-2 text-xs font-medium text-secondary-foreground hover:bg-secondary/80"
          >
            Zones ({zones.length})
          </button>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            <Search className={cn("h-3.5 w-3.5", discovering && "animate-spin")} />
            Re-Discover
          </button>
          <button
            onClick={loadData}
            className="rounded-lg bg-secondary px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
          </button>
        </div>
      </div>

      {/* Zone Management Panel */}
      {showZonePanel && (
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-semibold">Zones</h2>
          <div className="flex flex-wrap gap-2 mb-3">
            {zones.map((zone) => (
              <div
                key={zone.id}
                className="flex items-center gap-2 rounded-lg border border-border bg-secondary/30 px-3 py-1.5"
              >
                <div className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: zone.color }} />
                <span className="text-sm">{zone.name}</span>
                <button onClick={() => handleDeleteZone(zone.id)} className="text-muted-foreground hover:text-destructive ml-1">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={newZoneName}
              onChange={(e) => setNewZoneName(e.target.value)}
              placeholder="New zone (e.g. Upstairs, Downstairs, Master Bedroom)"
              className="flex-1 rounded-md border border-input bg-background px-3 py-1.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
              onKeyDown={(e) => e.key === "Enter" && handleCreateZone()}
            />
            <input
              type="color"
              value={newZoneColor}
              onChange={(e) => setNewZoneColor(e.target.value)}
              className="h-8 w-8 cursor-pointer rounded border border-input bg-background"
            />
            <button onClick={handleCreateZone} className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90">
              <Plus className="h-4 w-4" />
            </button>
          </div>
        </Card>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1 overflow-x-auto rounded-lg border border-border bg-secondary/30 p-1">
        {(Object.entries(CATEGORY_FILTERS) as [FilterCategory, typeof CATEGORY_FILTERS.all][]).map(
          ([key, { label }]) => (
            <button
              key={key}
              onClick={() => setFilter(key)}
              className={cn(
                "whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 opacity-60">{counts[key]}</span>
            </button>
          ),
        )}
      </div>

      {/* Integration filter */}
      {platforms.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setPlatformFilter("all")}
            className={cn(
              "rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
              platformFilter === "all"
                ? "bg-foreground/10 text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All integrations
          </button>
          {platforms.map((p) => (
            <button
              key={p}
              onClick={() => setPlatformFilter(platformFilter === p ? "all" : p)}
              className={cn(
                "flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors",
                platformFilter === p
                  ? "text-white"
                  : "text-muted-foreground hover:text-foreground",
              )}
              style={platformFilter === p ? { backgroundColor: getPlatformColor(p) } : undefined}
            >
              <span
                className="inline-block h-1.5 w-1.5 rounded-full"
                style={{ backgroundColor: getPlatformColor(p) }}
              />
              {getPlatformLabel(p)}
              <span className="opacity-60">
                {sensors.filter((s) => s.platform === p).length}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search by name, entity ID, or device class..."
          className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      {/* Sensor list */}
      <div className="space-y-2">
        {filtered.map((sensor) => {
          const live = liveStates[sensor.entity_id];
          const isUnavailable = live?.state === "unavailable" || live?.state === "unknown";
          const Icon = DEVICE_CLASS_ICONS[sensor.device_class || ""] || Thermometer;

          return (
            <Card
              key={sensor.id}
              className={cn(
                "flex items-center gap-4 px-4 py-3 transition-colors",
                isUnavailable && "opacity-50",
              )}
            >
              {/* Icon + Info */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>

              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium text-foreground">
                    {sensor.friendly_name}
                  </p>
                  {isUnavailable && (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                      UNAVAILABLE
                    </span>
                  )}
                  {live?.hvac_action && getActionBadge(live.hvac_action)}
                </div>
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <span className="truncate">{sensor.entity_id}</span>
                  <span>·</span>
                  <span>{sensor.domain}/{sensor.device_class || "—"}</span>
                  {sensor.platform && (
                    <>
                      <span>·</span>
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                        style={{
                          backgroundColor: getPlatformColor(sensor.platform) + "20",
                          color: getPlatformColor(sensor.platform),
                        }}
                      >
                        {getPlatformLabel(sensor.platform)}
                      </span>
                    </>
                  )}
                </p>
              </div>

              {/* Live value + last seen */}
              <div className="w-28 text-right">
                {live?.value != null ? (
                  <p className={cn("text-sm font-semibold", getStatusColor(live?.state))}>
                    {typeof live.value === "number" ? Math.round(live.value * 10) / 10 : live.value}
                    {live.unit ? <span className="text-xs text-muted-foreground ml-0.5">{live.unit}</span> : null}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    {isUnavailable ? "—" : live?.state || "—"}
                  </p>
                )}
                {live?.last_updated && (
                  <p className="text-[10px] text-muted-foreground/70 mt-0.5" title={live.last_updated}>
                    {timeAgo(live.last_updated)}
                  </p>
                )}
              </div>

              {/* Zone selector */}
              <div className="w-36">
                <select
                  value={sensor.zone_id ?? ""}
                  onChange={(e) =>
                    handleSensorUpdate(sensor.id, {
                      zone_id: e.target.value ? Number(e.target.value) : null,
                    })
                  }
                  className="w-full rounded border border-input bg-background px-2 py-1 text-xs text-foreground"
                >
                  <option value="">No zone</option>
                  {zones.map((z) => (
                    <option key={z.id} value={z.id}>
                      {z.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Outdoor toggle */}
              <button
                onClick={() => handleSensorUpdate(sensor.id, { is_outdoor: !sensor.is_outdoor })}
                title={sensor.is_outdoor ? "Outdoor sensor" : "Indoor sensor"}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                  sensor.is_outdoor
                    ? "border-brand/30 bg-brand/10 text-brand"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {sensor.is_outdoor ? <TreePine className="h-3.5 w-3.5" /> : <Home className="h-3.5 w-3.5" />}
              </button>

              {/* Track toggle */}
              <button
                onClick={() => handleSensorUpdate(sensor.id, { is_tracked: !sensor.is_tracked })}
                title={sensor.is_tracked ? "Tracking (click to stop)" : "Not tracked (click to track)"}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                  sensor.is_tracked
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {sensor.is_tracked ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              </button>
            </Card>
          );
        })}

        {filtered.length === 0 && !loading && (
          <div className="py-12 text-center text-sm text-muted-foreground">
            {sensors.length === 0
              ? "No sensors discovered yet. Click Re-Discover to scan Home Assistant."
              : "No sensors match your filter."}
          </div>
        )}
      </div>
    </div>
  );
}
