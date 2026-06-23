'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Activity, Server, Globe, Settings, Trash2, X, Clock,
  Play, Check, AlertCircle, Shield, Zap, Database, LogOut, Search,
  Save, RefreshCw, BarChart2, List, Radio,
} from 'lucide-react';
import { api, Monitor, Heartbeat } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { useSession, signOut } from 'next-auth/react';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
} from 'recharts';

export default function Dashboard() {
  // ── State (preserved verbatim from production) ──────────────────────────
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | 'new' | null>(null);
  const [centerActiveTab, setCenterActiveTab] = useState<'telemetry' | 'logs'>('telemetry');

  const [formData, setFormData] = useState({
    name: '',
    type: 'http' as 'http' | 'tcp' | 'icmp',
    url: '',
    port: 80,
    interval: 60,
    timeout: 10,
    keyword: '',
    expectedStatus: 200,
    webhookUrl: '',
    isPublic: false,
  });

  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ up: boolean; latency: number; message: string } | null>(null);
  const [runningNodeCheck, setRunningNodeCheck] = useState(false);
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [mounted, setMounted] = useState(false);

  const { data: session, status } = useSession({ required: true });

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  useEffect(() => {
    setMounted(true);

    async function initLoad() {
      try {
        const data = await api.getMonitors();
        setMonitors(data);

        const params = new URLSearchParams(window.location.search);
        const monitorParam = params.get('monitor');
        if (monitorParam) {
          const parsedId = parseInt(monitorParam);
          if (!isNaN(parsedId)) {
            setSelectedMonitorId(parsedId);
            setLoading(false);
            return;
          }
        }

        if (data.length > 0) {
          setSelectedMonitorId(data[0].id);
        }
      } catch (error) {
        console.error('Failed to init monitors:', error);
      } finally {
        setLoading(false);
      }
    }

    initLoad();

    const intervalId = setInterval(fetchMonitors, 1000);
    return () => clearInterval(intervalId);
  }, []);

  useEffect(() => {
    if (typeof selectedMonitorId === 'number') {
      fetchHeartbeats(selectedMonitorId);
      const intervalId = setInterval(() => fetchHeartbeats(selectedMonitorId), 1000);
      return () => clearInterval(intervalId);
    } else {
      setHeartbeats([]);
    }
  }, [selectedMonitorId]);

  useEffect(() => {
    if (selectedMonitorId === 'new') {
      setFormData({
        name: 'New Monitor',
        type: 'http',
        url: 'https://',
        port: 80,
        interval: 60,
        timeout: 10,
        keyword: '',
        expectedStatus: 200,
        webhookUrl: '',
        isPublic: false,
      });
      setTestResult(null);
    } else if (typeof selectedMonitorId === 'number') {
      const selected = monitors.find(m => m.id === selectedMonitorId);
      if (selected) {
        setFormData({
          name: selected.name,
          type: selected.type as 'http' | 'tcp' | 'icmp',
          url: selected.url,
          port: selected.port || 80,
          interval: selected.interval,
          timeout: selected.timeout,
          keyword: selected.keyword || '',
          expectedStatus: selected.expectedStatus || 200,
          webhookUrl: selected.webhookUrl || '',
          isPublic: selected.isPublic,
        });
      }
      setTestResult(null);
    }
  }, [selectedMonitorId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function fetchMonitors() {
    try {
      const data = await api.getMonitors();
      setMonitors(data);
    } catch (error) {
      console.error('Failed to fetch monitors:', error);
    } finally {
      setLoading(false);
    }
  }

  async function fetchHeartbeats(id: number) {
    try {
      const data = await api.getHeartbeats(id, 40);
      setHeartbeats(data);
    } catch (error) {
      console.error('Failed to fetch heartbeats:', error);
    }
  }

  async function handleSaveMonitor(e: React.FormEvent) {
    e.preventDefault();
    try {
      const payload = {
        name: formData.name,
        type: formData.type,
        url: formData.url,
        port: formData.port ? Number(formData.port) : undefined,
        interval: Number(formData.interval) || 60,
        timeout: Number(formData.timeout) || 10,
        keyword: formData.type === 'http' ? (formData.keyword || undefined) : undefined,
        expectedStatus: formData.type === 'http' ? (Number(formData.expectedStatus) || 200) : undefined,
        webhookUrl: formData.webhookUrl || undefined,
        isPublic: formData.isPublic,
      };

      if (selectedMonitorId === 'new') {
        const created = await api.createMonitor(payload);
        showToast('Monitor created successfully', 'success');
        setSelectedMonitorId(created.id);
        setMonitors([created, ...monitors]);
      } else if (typeof selectedMonitorId === 'number') {
        const updated = await api.updateMonitor(selectedMonitorId, payload);
        showToast('Monitor updated successfully', 'success');
        setMonitors(monitors.map(m => m.id === selectedMonitorId ? updated : m));
      }
    } catch (error) {
      console.error('Failed to save monitor:', error);
      showToast('Failed to save monitor. Check your configurations.', 'error');
    }
  }

  async function handleDeleteMonitor(id: number) {
    if (!confirm('Are you sure you want to delete this monitor? This action cannot be undone.')) return;
    try {
      await api.deleteMonitor(id);
      const remaining = monitors.filter(m => m.id !== id);
      setMonitors(remaining);
      setSelectedMonitorId(remaining.length > 0 ? remaining[0].id : null);
      showToast('Monitor deleted successfully', 'success');
    } catch (error) {
      console.error('Failed to delete monitor:', error);
      showToast('Failed to delete monitor', 'error');
    }
  }

  async function handleTestConnection() {
    setTestingConnection(true);
    setTestResult(null);
    try {
      const payload = {
        type: formData.type,
        url: formData.url,
        port: formData.port ? Number(formData.port) : undefined,
        timeout: Number(formData.timeout) || 10,
        keyword: formData.type === 'http' ? (formData.keyword || undefined) : undefined,
        expectedStatus: formData.type === 'http' ? (Number(formData.expectedStatus) || 200) : undefined,
        webhookUrl: formData.webhookUrl || undefined,
      };
      const result = await api.testDraftConnection(payload);
      setTestResult(result);
      if (result.webhookResult) {
        if (result.webhookResult.sent) {
          showToast('✅ Test webhook message sent successfully!', 'success');
        } else {
          showToast(`⚠️ Webhook failed: ${result.webhookResult.error}`, 'error');
        }
      }
    } catch (error: any) {
      setTestResult({
        up: false,
        latency: 0,
        message: error.response?.data?.error || error.message || 'Connection test failed',
      });
    } finally {
      setTestingConnection(false);
    }
  }

  async function handleNodePlayTest(id: number) {
    setRunningNodeCheck(true);
    try {
      const result = await api.testMonitorConnection(id);
      showToast(`Instant check: ${result.up ? 'ONLINE ✅' : 'OFFLINE 🔴'} - ${result.latency}ms (${result.message})`, result.up ? 'success' : 'error');
      fetchHeartbeats(id);
      fetchMonitors();
    } catch (error: any) {
      showToast(`Instant check failed: ${error.message}`, 'error');
    } finally {
      setRunningNodeCheck(false);
    }
  }

  // ── Derived data ────────────────────────────────────────────────────────
  const selectedMonitor = typeof selectedMonitorId === 'number'
    ? monitors.find(m => m.id === selectedMonitorId)
    : selectedMonitorId === 'new'
      ? { ...formData, id: -1, status: 'pending' as const, latency: undefined, uptime: 100 }
      : null;

  const filteredMonitors = monitors.filter(m =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    m.url.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const monitorsWithLatency = monitors.filter(m => m.latency);
  const avgLatency = monitorsWithLatency.length > 0
    ? Math.round(monitorsWithLatency.reduce((acc, m) => acc + (m.latency || 0), 0) / monitorsWithLatency.length)
    : 0;

  const stats = {
    total: monitors.length,
    up: monitors.filter(m => m.status === 'up').length,
    down: monitors.filter(m => m.status === 'down').length,
    avgLatency,
  };

  const chartData = heartbeats.slice().reverse().map(h => ({
    time: new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: h.latency || 0,
    status: h.status,
  }));

  const blockDuration = (24 * 60 * 60 * 1000) / 60;
  const now = Date.now();
  const blocks = Array.from({ length: 60 }).map((_, i) => {
    const startTime = now - (24 * 60 * 60 * 1000) + i * blockDuration;
    const endTime = startTime + blockDuration;
    const blockHeartbeats = heartbeats.filter(h => h.createdAt >= startTime && h.createdAt < endTime);

    if (blockHeartbeats.length === 0) {
      return { status: 'none', color: 'bg-white/5' };
    }
    const anyDown = blockHeartbeats.some(h => h.status === 'down');
    if (anyDown) {
      return { status: 'down', color: 'bg-status-red shadow-[0_0_8px_rgba(251,94,126,0.5)]' };
    }
    return { status: 'up', color: 'bg-status-green/80 shadow-[0_0_8px_rgba(52,211,153,0.4)]' };
  });

  // ── Helpers ─────────────────────────────────────────────────────────────
  const getStatusColor = (s?: string) => {
    if (s === 'up') return '#34D399';
    if (s === 'down') return '#FB5E7E';
    return '#38BDF8';
  };
  const activeColor = getStatusColor(selectedMonitor?.status);

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="h-10 w-10 rounded-full border-2 border-brand border-t-transparent animate-spin" />
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="flex h-screen w-screen overflow-hidden text-text-primary font-sans select-none gap-3 p-3">

      {/* ════════ LEFT: SYSTEM INVENTORY ════════ */}
      <motion.aside
        initial={{ opacity: 0, x: -16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        className="glass-panel w-80 flex flex-col flex-shrink-0 overflow-hidden"
      >
        {/* Brand header */}
        <div className="px-5 pt-5 pb-4 flex items-center gap-2.5">
          <div className="relative">
            <div className="absolute inset-0 bg-brand/40 blur-md rounded-full" />
            <Activity className="relative w-6 h-6 text-brand" />
          </div>
          <span className="text-lg font-extrabold tracking-tight text-gradient">MONSERV</span>
          <span className="ml-auto text-[10px] font-mono text-text-muted px-2 py-0.5 rounded-full border border-surface-border">
            v1.0
          </span>
        </div>

        {/* Search */}
        <div className="px-4 pb-3">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search inventory..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="input-field pl-9 text-sm py-2.5"
            />
          </div>
        </div>

        {/* Health indicators */}
        <div className="px-4 pb-3 grid grid-cols-3 gap-2">
          {[
            { label: 'Online', value: stats.up, dot: 'up', tint: 'text-status-green' },
            { label: 'Down', value: stats.down, dot: 'down', tint: 'text-status-red' },
            { label: 'Latency', value: `${stats.avgLatency}ms`, icon: true, tint: 'text-brand' },
          ].map((s, i) => (
            <div key={i} className="glass-well px-2.5 py-2 flex flex-col gap-1">
              <div className="flex items-center gap-1.5">
                {s.icon
                  ? <Clock className="w-3 h-3 text-text-muted" />
                  : <span className={`status-dot ${s.dot} w-1.5 h-1.5`} />}
                <span className="text-[9px] uppercase tracking-wider text-text-muted">{s.label}</span>
              </div>
              <span className={`text-sm font-bold font-mono ${s.tint}`}>{s.value}</span>
            </div>
          ))}
        </div>

        {/* Inventory list */}
        <div className="flex-1 overflow-y-auto px-2.5 pb-2 space-y-1.5">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredMonitors.length === 0 ? (
            <div className="text-center py-12 text-xs text-text-muted">No monitors found</div>
          ) : (
            filteredMonitors.map(m => {
              const isSelected = selectedMonitorId === m.id;
              return (
                <motion.div
                  key={m.id}
                  whileHover={{ scale: 1.008 }}
                  transition={{ type: 'spring', stiffness: 200, damping: 35 }}
                  className="group relative"
                >
                  <button
                    onClick={() => setSelectedMonitorId(m.id)}
                    className={`w-full text-left p-3 rounded-2xl flex items-center justify-between gap-3 border transition-colors duration-300 ${
                      isSelected
                        ? 'bg-brand/10 border-brand/30'
                        : 'bg-white/[0.02] border-white/[0.05] hover:border-white/10'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className={`status-dot ${m.status === 'up' ? 'up' : m.status === 'down' ? 'down' : 'pending'} w-2 h-2`} />
                        <span className="font-semibold text-sm truncate text-text-primary">{m.name}</span>
                      </div>
                      <span className="text-[11px] font-mono text-text-muted truncate block mt-0.5 pl-4">{m.url}</span>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <span className="text-[11px] font-mono text-text-secondary">{(m.uptime ?? 100).toFixed(1)}%</span>
                      {m.latency ? (
                        <span className="text-[10px] text-text-muted block font-mono">{m.latency}ms</span>
                      ) : null}
                    </div>
                  </button>

                  {/* Inline micro-menu — revealed on hover */}
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none group-hover:pointer-events-auto">
                    <button
                      onClick={(e) => { e.stopPropagation(); handleDeleteMonitor(m.id); }}
                      title="Delete monitor"
                      className="p-1.5 rounded-lg bg-background-secondary/80 backdrop-blur border border-surface-border text-text-muted hover:text-status-red hover:border-status-red/40 transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </motion.div>
              );
            })
          )}
        </div>

        {/* Footer: account + actions */}
        <div className="p-3 border-t border-surface-border space-y-2">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-full bg-brand/15 border border-brand/30 flex items-center justify-center text-brand font-bold text-sm flex-shrink-0">
                {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold block truncate text-text-primary">{session?.user?.name || session?.user?.email || 'Admin'}</span>
                <span className="text-[10px] text-text-muted block">System Admin</span>
              </div>
            </div>
            <button onClick={() => signOut()} title="Sign Out"
              className="p-1.5 rounded-lg text-text-muted hover:text-status-red hover:bg-white/5 transition-colors flex-shrink-0">
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <a href="/status" target="_blank"
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl bg-white/[0.03] border border-surface-border text-text-secondary hover:text-brand hover:border-brand/30 transition-all text-xs font-medium">
            <Globe className="w-3.5 h-3.5" /> Public Status Board
          </a>

          <button onClick={() => setSelectedMonitorId('new')} className="btn-primary w-full py-2.5 flex items-center justify-center gap-2 text-sm">
            <Plus className="w-4 h-4" /> Create Monitor
          </button>
        </div>
      </motion.aside>

      {/* ════════ CENTER: FLOW + TELEMETRY ════════ */}
      <motion.main
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
        className="flex-1 flex flex-col min-w-0 gap-3"
      >
        {/* Flow graph slab */}
        <div className="glass-panel flex-[1.1] flex items-center justify-center relative p-6 min-h-0 overflow-hidden">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[260px] rounded-full blur-[90px] opacity-30 pointer-events-none"
            style={{ background: `radial-gradient(circle, ${activeColor}, transparent 70%)` }} />

          {selectedMonitor ? (() => {
            const targetColor = selectedMonitorId === 'new' ? '#FB5E7E' : (selectedMonitor.status === 'up' ? '#34D399' : '#FB5E7E');
            const webhookColor = selectedMonitorId === 'new' ? '#FB5E7E' : (selectedMonitor.webhookUrl ? '#34D399' : '#5C6B82');

            return (
              <div className="w-full max-w-5xl relative flex justify-between items-center px-2 md:px-6 z-10">

                {/* NODE 1: TARGET */}
                <motion.div whileHover={{ scale: 1.01, y: -2 }} transition={{ type: 'spring', stiffness: 180, damping: 30 }}
                  className="glass-card w-[210px] p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand/15 border border-brand/25 flex items-center justify-center text-brand">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Target</h4>
                      <span className="text-sm font-bold text-text-primary block leading-tight">Request</span>
                    </div>
                  </div>
                  <div className="h-px bg-surface-border" />
                  <div className="space-y-1.5 text-xs text-text-secondary">
                    <div className="flex justify-between"><span>Type</span><span className="font-bold uppercase font-mono text-text-primary">{selectedMonitor.type}</span></div>
                    <div className="flex justify-between"><span>Interval</span><span className="font-bold font-mono text-text-primary">{selectedMonitor.interval}s</span></div>
                    {selectedMonitor.port ? (
                      <div className="flex justify-between"><span>Port</span><span className="font-bold font-mono text-text-primary">{selectedMonitor.port}</span></div>
                    ) : null}
                  </div>
                </motion.div>

                {/* CONNECTOR 1 */}
                {mounted && (
                  <div className="flex-1 min-w-[28px] px-3">
                    <div className="flow-bar" style={{ ['--flow-color' as any]: targetColor }} />
                  </div>
                )}

                {/* NODE 2: ENGINE */}
                <motion.div whileHover={{ scale: 1.01, y: -2 }} transition={{ type: 'spring', stiffness: 180, damping: 30 }}
                  className="glass-card w-[250px] p-5 flex flex-col gap-4 relative"
                  style={{ borderColor: `${activeColor}45`, boxShadow: `0 0 30px -8px ${activeColor}55` }}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-2xl flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${activeColor}1a`, border: `1px solid ${activeColor}40` }}>
                        {selectedMonitor.type === 'http' ? <Globe className="w-4 h-4" style={{ color: activeColor }} /> :
                          selectedMonitor.type === 'tcp' ? <Server className="w-4 h-4" style={{ color: activeColor }} /> :
                            <Shield className="w-4 h-4" style={{ color: activeColor }} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Check Engine</h4>
                        <span className="text-sm font-extrabold text-text-primary block truncate">{selectedMonitor.name}</span>
                      </div>
                    </div>
                    {selectedMonitorId !== 'new' && (
                      <button onClick={() => handleNodePlayTest(selectedMonitor.id)} disabled={runningNodeCheck} title="Run check now"
                        className="p-1.5 rounded-xl bg-white/5 border border-surface-border text-text-secondary hover:text-brand hover:border-brand/40 transition-all active:scale-95 flex-shrink-0">
                        <Play className={`w-3 h-3 fill-current ${runningNodeCheck ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>

                  <div className="glass-well px-2.5 py-2">
                    <span className="font-mono text-xs text-text-secondary truncate block select-text">{selectedMonitor.url}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-secondary">Uptime</span>
                    <span className="font-bold font-mono text-text-primary">{(selectedMonitor.uptime || 100).toFixed(1)}%</span>
                  </div>
                  <div className="h-px bg-surface-border" />
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Status</span>
                    <div className="flex items-center gap-1.5">
                      {selectedMonitor.latency ? (
                        <span className="text-[11px] font-mono font-bold text-text-primary px-1.5 py-0.5 glass-well">{selectedMonitor.latency}ms</span>
                      ) : null}
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border"
                        style={{ color: activeColor, borderColor: `${activeColor}40`, backgroundColor: `${activeColor}12` }}>
                        {selectedMonitor.status === 'up' ? 'Online' : selectedMonitor.status === 'down' ? 'Offline' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </motion.div>

                {/* CONNECTOR 2 */}
                {mounted && (
                  <div className="flex-1 min-w-[28px] px-3">
                    <div className="flow-bar" style={{ ['--flow-color' as any]: webhookColor }} />
                  </div>
                )}

                {/* NODE 3: WEBHOOK */}
                <motion.div whileHover={{ scale: 1.01, y: -2 }} transition={{ type: 'spring', stiffness: 180, damping: 30 }}
                  className="glass-card w-[210px] p-4 flex flex-col gap-2.5"
                  style={{ borderColor: selectedMonitor.webhookUrl ? `${activeColor}40` : undefined }}>
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selectedMonitor.webhookUrl ? 'bg-brand/15 text-brand border border-brand/25' : 'bg-white/5 text-text-muted border border-transparent'}`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[9px] font-bold uppercase tracking-wider text-text-muted">Integration</h4>
                      <span className="text-sm font-bold text-text-primary block leading-tight">Webhook</span>
                    </div>
                  </div>
                  <div className="h-px bg-surface-border" />
                  <span className="text-[10px] font-mono text-text-secondary truncate block select-text">
                    {selectedMonitor.webhookUrl || 'Not configured'}
                  </span>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Alert</span>
                    <span className={`font-bold ${selectedMonitor.webhookUrl ? 'text-status-green' : 'text-text-muted'}`}>
                      {selectedMonitor.webhookUrl ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </motion.div>
              </div>
            );
          })() : (
            <div className="text-center max-w-sm glass-card p-8">
              <Database className="w-10 h-10 text-brand mx-auto mb-4 animate-floaty" />
              <h3 className="text-base font-bold text-text-primary">No Monitor Selected</h3>
              <p className="text-xs text-text-secondary mt-2 mb-6">Select an active monitor or create one to configure your spatial check flow.</p>
              <button onClick={() => setSelectedMonitorId('new')} className="btn-primary flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Setup Monitor
              </button>
            </div>
          )}
        </div>

        {/* Telemetry slab */}
        <div className="glass-panel flex-[0.9] p-5 flex flex-col overflow-hidden min-h-0">
          {selectedMonitor && selectedMonitorId !== 'new' ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Radio className="w-4 h-4 text-brand" />
                  <h3 className="text-sm font-bold text-text-primary">Live Telemetry</h3>
                </div>
                <div className="flex bg-white/[0.03] p-0.5 rounded-xl text-xs border border-surface-border">
                  <button onClick={() => setCenterActiveTab('telemetry')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${centerActiveTab === 'telemetry' ? 'bg-brand/15 text-brand' : 'text-text-secondary hover:text-text-primary'}`}>
                    <BarChart2 className="w-3.5 h-3.5" /> Performance
                  </button>
                  <button onClick={() => setCenterActiveTab('logs')}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${centerActiveTab === 'logs' ? 'bg-brand/15 text-brand' : 'text-text-secondary hover:text-text-primary'}`}>
                    <List className="w-3.5 h-3.5" /> Activity
                  </button>
                </div>
              </div>

              <div className="flex-1 min-h-0 overflow-y-auto pr-1">
                {centerActiveTab === 'telemetry' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-5 h-full items-start">
                    <div className="space-y-4 md:col-span-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="glass-well p-3">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider block">Avg Latency</span>
                          <span className="text-lg font-bold font-mono text-text-primary mt-0.5 block">
                            {chartData.length > 0 ? Math.round(chartData.reduce((acc, c) => acc + c.latency, 0) / chartData.length) : 0}ms
                          </span>
                        </div>
                        <div className="glass-well p-3">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider block">Availability</span>
                          <span className="text-lg font-bold font-mono text-status-green mt-0.5 block">{selectedMonitor.uptime?.toFixed(1) || 100}%</span>
                        </div>
                      </div>

                      <div className="glass-well p-4">
                        <div className="flex items-center justify-between text-xs mb-2.5 text-text-secondary">
                          <span className="font-semibold">Uptime History</span>
                          <span className="text-[10px] text-text-muted">24h · 60 blocks</span>
                        </div>
                        <div className="flex gap-0.5 h-6 items-end">
                          {blocks.map((block, i) => (
                            <div key={i} className={`flex-1 h-4 rounded-[2px] transition-all hover:scale-y-150 ${block.color}`}
                              title={block.status === 'none' ? 'No data' : block.status === 'down' ? 'Down' : 'Operational'} />
                          ))}
                        </div>
                        <div className="flex justify-between text-[9px] text-text-muted mt-2">
                          <span>24h ago</span><span>Now</span>
                        </div>
                      </div>
                    </div>

                    {/* Premium aqua-glow latency chart */}
                    <div className="md:col-span-2 h-[180px] glass-well p-3">
                      {chartData.length < 2 ? (
                        <div className="h-full flex items-center justify-center text-xs text-text-muted">Collecting latency records…</div>
                      ) : (
                        mounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={chartData} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}>
                              <defs>
                                <linearGradient id="latencyGlow" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="0%" stopColor="#38BDF8" stopOpacity={0.35} />
                                  <stop offset="100%" stopColor="#38BDF8" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 6" stroke="rgba(255,255,255,0.05)" vertical={false} />
                              <XAxis dataKey="time" stroke="#5C6B82" fontSize={8} tickLine={false} axisLine={false} minTickGap={28} />
                              <YAxis stroke="#5C6B82" fontSize={8} unit="ms" tickLine={false} axisLine={false} width={42} />
                              <Tooltip
                                cursor={{ stroke: 'rgba(56,189,248,0.3)', strokeWidth: 1 }}
                                contentStyle={{
                                  background: 'rgba(11,18,32,0.85)',
                                  border: '1px solid rgba(56,189,248,0.25)',
                                  borderRadius: '12px',
                                  backdropFilter: 'blur(16px)',
                                  color: '#E6EDF5',
                                  fontSize: '11px',
                                  boxShadow: '0 12px 32px -10px rgba(0,0,0,0.7)',
                                }}
                                labelStyle={{ color: '#93A4BC', fontSize: '10px', marginBottom: 4 }}
                                itemStyle={{ color: '#38BDF8' }}
                              />
                              <Area type="monotone" dataKey="latency" stroke="#38BDF8" strokeWidth={2.5}
                                fill="url(#latencyGlow)" dot={false}
                                activeDot={{ r: 4, fill: '#22D3EE', stroke: '#0b1220', strokeWidth: 2 }}
                                style={{ filter: 'drop-shadow(0 0 6px rgba(56,189,248,0.55))' }} />
                            </AreaChart>
                          </ResponsiveContainer>
                        )
                      )}
                    </div>
                  </div>
                )}

                {centerActiveTab === 'logs' && (
                  <div className="space-y-2">
                    {heartbeats.length === 0 ? (
                      <div className="text-center py-8 text-xs text-text-muted">No heartbeat logs recorded yet…</div>
                    ) : (
                      heartbeats.map((log, index) => (
                        <div key={log.id || index} className="glass-well p-2.5 flex items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <span className={`status-dot ${log.status === 'up' ? 'up' : 'down'} w-2 h-2`} />
                            <span className={`font-bold ${log.status === 'up' ? 'text-status-green' : 'text-status-red'}`}>
                              {log.status === 'up' ? 'UP' : 'DOWN'}
                            </span>
                            <span className="font-mono text-text-secondary truncate select-text">{log.message || 'No detail'}</span>
                          </div>
                          <div className="flex items-center gap-4 flex-shrink-0 text-[10px] text-text-muted font-mono">
                            {log.latency !== undefined && <span>{log.latency}ms</span>}
                            <span>{formatDistanceToNow(log.createdAt, { addSuffix: true })}</span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-center text-xs text-text-muted px-8">
              Select a monitor to display real-time latency telemetry, availability reports, and heartbeat history.
            </div>
          )}
        </div>
      </motion.main>

      {/* ════════ RIGHT: CONFIGURATION ════════ */}
      <motion.aside
        initial={{ opacity: 0, x: 16 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
        className="glass-panel w-[400px] flex flex-col flex-shrink-0 overflow-hidden"
      >
        <div className="px-5 py-4 border-b border-surface-border flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-text-secondary">
          <Settings className="w-4 h-4 text-brand" />
          <span>{selectedMonitorId === 'new' ? 'New Monitor' : 'Configure Monitor'}</span>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {selectedMonitor ? (
            <form onSubmit={handleSaveMonitor} className="space-y-4">
              <div>
                <label className="label">Monitor Name</label>
                <input type="text" value={formData.name} onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input-field" placeholder="Production Server" required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Protocol</label>
                  <select value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value as any })} className="select-field">
                    <option value="http">HTTP/HTTPS</option>
                    <option value="tcp">TCP Port</option>
                    <option value="icmp">ICMP Ping</option>
                  </select>
                </div>
                {formData.type === 'tcp' && (
                  <div>
                    <label className="label">TCP Port</label>
                    <input type="number" value={formData.port}
                      onChange={e => { const v = parseInt(e.target.value); setFormData({ ...formData, port: isNaN(v) ? '' as any : v }); }}
                      className="input-field" min="1" max="65535" />
                  </div>
                )}
              </div>

              <div>
                <label className="label">{formData.type === 'http' ? 'Destination URL' : 'Host / IP Address'}</label>
                <input type="text" value={formData.url} onChange={e => setFormData({ ...formData, url: e.target.value })}
                  className="input-field font-mono text-sm" placeholder={formData.type === 'http' ? 'https://mywebsite.com' : '192.168.1.100'} required />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Interval (s)</label>
                  <input type="number" value={formData.interval}
                    onChange={e => { const v = parseInt(e.target.value); setFormData({ ...formData, interval: isNaN(v) ? '' as any : v }); }}
                    className="input-field" min="1" max="3600" />
                </div>
                <div>
                  <label className="label">Timeout (s)</label>
                  <input type="number" value={formData.timeout}
                    onChange={e => { const v = parseInt(e.target.value); setFormData({ ...formData, timeout: isNaN(v) ? '' as any : v }); }}
                    className="input-field" min="1" max="30" />
                </div>
              </div>

              {formData.type === 'http' && (
                <div className="grid grid-cols-2 gap-3 glass-well p-3">
                  <div>
                    <label className="label">Expected Status</label>
                    <input type="number" value={formData.expectedStatus}
                      onChange={e => { const v = parseInt(e.target.value); setFormData({ ...formData, expectedStatus: isNaN(v) ? '' as any : v }); }}
                      className="input-field" placeholder="200" />
                  </div>
                  <div>
                    <label className="label">Match Keyword</label>
                    <input type="text" value={formData.keyword} onChange={e => setFormData({ ...formData, keyword: e.target.value })}
                      className="input-field" placeholder="optional" />
                  </div>
                </div>
              )}

              <div>
                <label className="label">Webhook URL (Slack/Discord)</label>
                <input type="url" value={formData.webhookUrl} onChange={e => setFormData({ ...formData, webhookUrl: e.target.value })}
                  className="input-field text-xs font-mono" placeholder="https://hooks.slack.com/services/..." />
              </div>

              <label htmlFor="isPublic" className="flex items-center gap-3 py-1 cursor-pointer select-none">
                <input type="checkbox" id="isPublic" checked={formData.isPublic}
                  onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4 h-4 rounded border-surface-border bg-white/5 text-brand focus:ring-brand/40 accent-sky-400" />
                <span className="text-xs font-semibold text-text-secondary">Expose to Public status board</span>
              </label>

              <div className="h-px bg-surface-border my-1" />

              <AnimatePresence>
                {testResult && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
                    className={`p-4 rounded-2xl border text-xs ${testResult.up ? 'bg-status-green/10 border-status-green/30 text-status-green' : 'bg-status-red/10 border-status-red/30 text-status-red'}`}>
                    <div className="flex items-center justify-between font-bold mb-2">
                      <span className="flex items-center gap-1.5">
                        {testResult.up ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {testResult.up ? 'Test Succeeded' : 'Test Failed'}
                      </span>
                      <span className="font-mono">{testResult.latency}ms</span>
                    </div>
                    <p className="text-text-secondary font-mono text-[11px] leading-relaxed bg-black/20 p-2 rounded-lg border border-surface-border select-text">
                      {testResult.message}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              <div className="flex flex-col gap-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={handleTestConnection} disabled={testingConnection || !formData.url}
                    className="btn-secondary py-2.5 flex items-center justify-center gap-2 text-xs">
                    {testingConnection ? <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Testing…</> : <><Play className="w-3.5 h-3.5 fill-current" /> Test</>}
                  </button>
                  <button type="submit" className="btn-primary py-2.5 flex items-center justify-center gap-2 text-xs">
                    <Save className="w-3.5 h-3.5" /> Save
                  </button>
                </div>

                {selectedMonitorId !== 'new' && (
                  <button type="button" onClick={() => handleDeleteMonitor(selectedMonitor.id)}
                    className="btn-danger w-full py-2.5 text-xs flex items-center justify-center gap-2">
                    <Trash2 className="w-4 h-4" /> Delete Monitor
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="text-center py-20 text-xs text-text-muted">
              Create or select a monitor to inspect and modify its configuration.
            </div>
          )}
        </div>
      </motion.aside>

      {/* ════════ TOAST ════════ */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -40, scale: 0.92 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.92 }}
            transition={{ type: 'spring', stiffness: 200, damping: 35 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl border backdrop-blur-xl ${
              toast.type === 'success' ? 'bg-status-green/15 border-status-green/30 text-status-green'
                : toast.type === 'error' ? 'bg-status-red/15 border-status-red/30 text-status-red'
                  : 'bg-brand/15 border-brand/30 text-brand'
            }`}
            style={{ boxShadow: '0 18px 50px -12px rgba(0,0,0,0.6)' }}
          >
            <span className="font-semibold text-sm">{toast.message}</span>
            <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100 transition-opacity">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
