import { useEffect, useState } from "react";
import {
  Server,
  CloudSun,
  Database,
  Check,
  X,
  Plus,
  Trash2,
  Search,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  getSettings,
  updateSettings,
  testHA,
  testNWS,
  getSensors,
  updateSensor,
  discoverSensors,
  getZones,
  createZone,
  deleteZone,
  getDbStats,
  type Settings as SettingsType,
  type Sensor,
  type Zone,
  type ConnectionTest,
  type DbStats,
} from "@/lib/api";

export default function Settings() {
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [sensors, setSensors] = useState<Sensor[]>([]);
  const [zones, setZones] = useState<Zone[]>([]);
  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [haTest, setHaTest] = useState<ConnectionTest | null>(null);
  const [nwsTest, setNwsTest] = useState<ConnectionTest | null>(null);
  const [saving, setSaving] = useState(false);
  const [discovering, setDiscovering] = useState(false);

  const [haUrl, setHaUrl] = useState("");
  const [haToken, setHaToken] = useState("");
  const [nwsLat, setNwsLat] = useState("");
  const [nwsLon, setNwsLon] = useState("");
  const [newZoneName, setNewZoneName] = useState("");
  const [newZoneColor, setNewZoneColor] = useState("#e5a10e");

  useEffect(() => {
    loadAll();
  }, []);

  const loadAll = async () => {
    try {
      const [s, sens, z, db] = await Promise.all([
        getSettings(),
        getSensors(),
        getZones(),
        getDbStats(),
      ]);
      setSettings(s);
      setSensors(sens);
      setZones(z);
      setDbStats(db);
      setHaUrl(s.ha_url);
      setNwsLat(String(s.nws_lat));
      setNwsLon(String(s.nws_lon));
    } catch (e) {
      console.error("Failed to load settings:", e);
    }
  };

  const handleSaveHA = async () => {
    setSaving(true);
    try {
      const data: Record<string, string | number> = { ha_url: haUrl };
      if (haToken) data.ha_token = haToken;
      await updateSettings(data);
      setHaToken("");
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleTestHA = async () => {
    setHaTest(null);
    try {
      const result = await testHA();
      setHaTest(result);
    } catch (e) {
      setHaTest({ success: false, message: String(e), entities_found: 0 });
    }
  };

  const handleSaveNWS = async () => {
    setSaving(true);
    try {
      await updateSettings({
        nws_lat: parseFloat(nwsLat),
        nws_lon: parseFloat(nwsLon),
        nws_station_id: "",
      });
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const handleTestNWS = async () => {
    setNwsTest(null);
    try {
      const result = await testNWS();
      setNwsTest(result);
    } catch (e) {
      setNwsTest({ success: false, message: String(e), entities_found: 0 });
    }
  };

  const handleDiscover = async () => {
    setDiscovering(true);
    try {
      const result = await discoverSensors();
      alert(`Discovered ${result.discovered} new sensors`);
      const sens = await getSensors();
      setSensors(sens);
    } catch (e) {
      alert(`Discovery failed: ${e}`);
    } finally {
      setDiscovering(false);
    }
  };

  const handleSensorUpdate = async (id: number, updates: Partial<Sensor>) => {
    await updateSensor(id, updates);
    const sens = await getSensors();
    setSensors(sens);
  };

  const handleCreateZone = async () => {
    if (!newZoneName.trim()) return;
    await createZone({ name: newZoneName.trim(), color: newZoneColor });
    setNewZoneName("");
    const z = await getZones();
    setZones(z);
  };

  const handleDeleteZone = async (id: number) => {
    if (!confirm("Delete this zone?")) return;
    await deleteZone(id);
    const z = await getZones();
    setZones(z);
  };

  const inputClasses = "mt-1 w-full rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/30 transition-colors";
  const btnPrimary = "rounded-lg bg-primary px-4 py-2.5 text-[12px] font-semibold text-primary-foreground shadow-sm shadow-primary/20 hover:bg-primary/90 disabled:opacity-50 transition-colors";
  const btnSecondary = "rounded-lg border border-border/50 bg-secondary/50 px-4 py-2.5 text-[12px] font-medium text-secondary-foreground hover:bg-secondary/80 transition-colors";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight">Settings</h1>
        <p className="mt-0.5 text-[12px] text-muted-foreground">
          Configure data sources, zones & sensors
        </p>
      </div>

      {/* Home Assistant Connection */}
      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Server className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-display text-sm font-semibold">Home Assistant</h2>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">URL</label>
            <input
              type="text"
              value={haUrl}
              onChange={(e) => setHaUrl(e.target.value)}
              placeholder="http://homeassistant.local:8123"
              className={inputClasses}
            />
          </div>
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Long-Lived Access Token {settings?.ha_token_set && <span className="text-success">(set)</span>}
            </label>
            <input
              type="password"
              value={haToken}
              onChange={(e) => setHaToken(e.target.value)}
              placeholder={settings?.ha_token_set ? "Leave blank to keep current" : "Enter token"}
              className={inputClasses}
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleSaveHA} disabled={saving} className={btnPrimary}>
              Save
            </button>
            <button onClick={handleTestHA} className={btnSecondary}>
              Test Connection
            </button>
          </div>
          {haTest && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-medium",
                haTest.success
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20",
              )}
            >
              {haTest.success ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {haTest.message}
              {haTest.entities_found > 0 && ` (${haTest.entities_found} climate entities)`}
            </div>
          )}
        </div>
      </Card>

      {/* NWS Weather */}
      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#fbbf24]/10">
            <CloudSun className="h-4 w-4 text-[#fbbf24]" />
          </div>
          <h2 className="font-display text-sm font-semibold">NWS Weather</h2>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Latitude</label>
              <input
                type="text"
                value={nwsLat}
                onChange={(e) => setNwsLat(e.target.value)}
                className={inputClasses}
              />
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Longitude</label>
              <input
                type="text"
                value={nwsLon}
                onChange={(e) => setNwsLon(e.target.value)}
                className={inputClasses}
              />
            </div>
          </div>
          {settings?.nws_station_id && (
            <p className="text-[12px] text-muted-foreground">
              Station: <span className="font-mono text-foreground">{settings.nws_station_id}</span>
            </p>
          )}
          <div className="flex gap-2">
            <button onClick={handleSaveNWS} disabled={saving} className={btnPrimary}>
              Save
            </button>
            <button onClick={handleTestNWS} className={btnSecondary}>
              Test Connection
            </button>
          </div>
          {nwsTest && (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg px-3 py-2.5 text-[12px] font-medium",
                nwsTest.success
                  ? "bg-success/10 text-success border border-success/20"
                  : "bg-destructive/10 text-destructive border border-destructive/20",
              )}
            >
              {nwsTest.success ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
              {nwsTest.message}
            </div>
          )}
        </div>
      </Card>

      {/* Zones */}
      <Card className="p-6">
        <h2 className="mb-4 font-display text-sm font-semibold">Zones</h2>
        <div className="space-y-2 mb-4">
          {zones.map((zone) => (
            <div
              key={zone.id}
              className="flex items-center justify-between rounded-lg border border-border/40 bg-secondary/20 px-4 py-2.5 transition-colors hover:bg-secondary/30"
            >
              <div className="flex items-center gap-2.5">
                <div
                  className="h-3 w-3 rounded-full ring-1 ring-white/10"
                  style={{ backgroundColor: zone.color }}
                />
                <span className="text-[13px] font-medium text-foreground">{zone.name}</span>
              </div>
              <button
                onClick={() => handleDeleteZone(zone.id)}
                className="text-muted-foreground hover:text-destructive transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={newZoneName}
            onChange={(e) => setNewZoneName(e.target.value)}
            placeholder="New zone name"
            className="flex-1 rounded-lg border border-border/50 bg-secondary/30 px-3 py-2.5 text-sm placeholder:text-muted-foreground/60 focus:outline-none focus:ring-2 focus:ring-primary/30"
            onKeyDown={(e) => e.key === "Enter" && handleCreateZone()}
          />
          <input
            type="color"
            value={newZoneColor}
            onChange={(e) => setNewZoneColor(e.target.value)}
            className="h-10 w-10 cursor-pointer rounded-lg border border-border/50 bg-secondary/30"
          />
          <button onClick={handleCreateZone} className={btnPrimary}>
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </Card>

      {/* Sensors */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display text-sm font-semibold">Sensors</h2>
          <button
            onClick={handleDiscover}
            disabled={discovering}
            className={cn(btnPrimary, "flex items-center gap-2")}
          >
            <Search className={`h-3.5 w-3.5 ${discovering ? "animate-spin" : ""}`} />
            Discover
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/40 text-left">
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Entity</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Type</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Zone</th>
                <th className="pb-3 pr-4 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Outdoor</th>
                <th className="pb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tracked</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/30">
              {sensors.map((sensor) => (
                <tr key={sensor.id} className="transition-colors hover:bg-secondary/20">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-foreground">{sensor.friendly_name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{sensor.entity_id}</p>
                  </td>
                  <td className="py-3 pr-4 font-mono text-[11px] text-muted-foreground">
                    {sensor.domain}/{sensor.device_class || "\u2014"}
                  </td>
                  <td className="py-3 pr-4">
                    <select
                      value={sensor.zone_id ?? ""}
                      onChange={(e) =>
                        handleSensorUpdate(sensor.id, {
                          zone_id: e.target.value ? Number(e.target.value) : null,
                        })
                      }
                      className="rounded-md border border-border/50 bg-secondary/30 px-2 py-1.5 text-[11px] text-foreground"
                    >
                      <option value="">None</option>
                      {zones.map((z) => (
                        <option key={z.id} value={z.id}>
                          {z.name}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="py-3 pr-4">
                    <input
                      type="checkbox"
                      checked={sensor.is_outdoor}
                      onChange={(e) =>
                        handleSensorUpdate(sensor.id, { is_outdoor: e.target.checked })
                      }
                      className="rounded accent-primary"
                    />
                  </td>
                  <td className="py-3">
                    <input
                      type="checkbox"
                      checked={sensor.is_tracked}
                      onChange={(e) =>
                        handleSensorUpdate(sensor.id, { is_tracked: e.target.checked })
                      }
                      className="rounded accent-primary"
                    />
                  </td>
                </tr>
              ))}
              {sensors.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-muted-foreground">
                    No sensors discovered. Configure HA connection and click Discover.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Database Stats */}
      <Card className="p-6">
        <div className="flex items-center gap-2.5 mb-5">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10">
            <Database className="h-4 w-4 text-primary" />
          </div>
          <h2 className="font-display text-sm font-semibold">Database</h2>
        </div>
        {dbStats && (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Readings</p>
              <p className="mt-1 font-mono text-xl font-bold">{dbStats.total_readings.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Weather Obs</p>
              <p className="mt-1 font-mono text-xl font-bold">{dbStats.total_weather.toLocaleString()}</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">DB Size</p>
              <p className="mt-1 font-mono text-xl font-bold">{dbStats.db_size_mb} MB</p>
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Date Range</p>
              <p className="mt-1 font-mono text-[12px] text-foreground">
                {dbStats.oldest_reading
                  ? new Date(dbStats.oldest_reading).toLocaleDateString()
                  : "\u2014"}{" "}
                to{" "}
                {dbStats.newest_reading
                  ? new Date(dbStats.newest_reading).toLocaleDateString()
                  : "\u2014"}
              </p>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
