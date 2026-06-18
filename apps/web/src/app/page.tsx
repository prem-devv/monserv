'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Plus, Activity, Server, Globe, CheckCircle, XCircle, AlertTriangle, 
  Settings, ExternalLink, Trash2, Edit, X, Mail, Clock, ArrowRight, 
  Play, Check, AlertCircle, Shield, Zap, Database, LogOut, Search, Save, RefreshCw, BarChart2, List
} from 'lucide-react';
import { api, Monitor, Heartbeat } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';
import { useSession, signOut } from 'next-auth/react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';

export default function Dashboard() {
  const [monitors, setMonitors] = useState<Monitor[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonitorId, setSelectedMonitorId] = useState<number | 'new' | null>(null);
  
  // Center Telemetry tabs
  const [centerActiveTab, setCenterActiveTab] = useState<'telemetry' | 'logs'>('telemetry');

  // Form states for Monitor Configuration
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

  // Connection testing states
  const [testingConnection, setTestingConnection] = useState(false);
  const [testResult, setTestResult] = useState<{ up: boolean; latency: number; message: string } | null>(null);
  const [runningNodeCheck, setRunningNodeCheck] = useState(false);

  // Heartbeats for selected monitor
  const [heartbeats, setHeartbeats] = useState<Heartbeat[]>([]);

  // Custom Toast State
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const { data: session, status } = useSession({ required: true });

  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    
    // Initial fetch that loads monitors and resolves selection once on mount
    async function initLoad() {
      try {
        const data = await api.getMonitors();
        setMonitors(data);
        
        // Parse tab and monitor query parameters on mount
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
        
        // Default to first monitor if none specified and data exists
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

    // Poll monitors list every 1 second for live status updates
    const intervalId = setInterval(fetchMonitors, 1000);
    return () => clearInterval(intervalId);
  }, []);

  // Poll heartbeats for the selected monitor
  useEffect(() => {
    if (typeof selectedMonitorId === 'number') {
      fetchHeartbeats(selectedMonitorId);
      const intervalId = setInterval(() => fetchHeartbeats(selectedMonitorId), 1000);
      return () => clearInterval(intervalId);
    } else {
      setHeartbeats([]);
    }
  }, [selectedMonitorId]);

  // Sync form when monitor selection changes - FIXED race condition glitch
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
  }, [selectedMonitorId]); // ONLY run when selectedMonitorId changes, avoiding resetting on monitors list updates

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
      // Sanitize fields before sending to prevent validation crash due to unused fields
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
        
        // Prevent useEffect form reset before state changes by setting ID first
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

  // Trigger test for draft form configuration with input sanitization
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
      };
      const result = await api.testDraftConnection(payload);
      setTestResult(result);
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

  // Run immediate connection check for currently active monitor in database
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

  const selectedMonitor = typeof selectedMonitorId === 'number' 
    ? monitors.find(m => m.id === selectedMonitorId)
    : selectedMonitorId === 'new'
      ? { ...formData, id: -1, status: 'pending' as const, latency: undefined, uptime: 100 }
      : null;

  // Filter monitors list by search query
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
    avgLatency
  };

  // Format Recharts data safely
  const chartData = heartbeats.slice().reverse().map(h => ({
    time: new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    latency: h.latency || 0,
    status: h.status
  }));

  // Setup 24h uptime grid blocks
  const blockDuration = (24 * 60 * 60 * 1000) / 60;
  const now = Date.now();
  const blocks = Array.from({ length: 60 }).map((_, i) => {
    const startTime = now - (24 * 60 * 60 * 1000) + i * blockDuration;
    const endTime = startTime + blockDuration;
    const blockHeartbeats = heartbeats.filter(h => h.createdAt >= startTime && h.createdAt < endTime);
    
    if (blockHeartbeats.length === 0) {
      return { status: 'none', color: 'bg-gray-100 border border-gray-200' };
    }
    const anyDown = blockHeartbeats.some(h => h.status === 'down');
    if (anyDown) {
      return { status: 'down', color: 'bg-status-red shadow-[0_0_8px_rgba(239,68,68,0.3)]' };
    }
    return { status: 'up', color: 'bg-status-green opacity-90' };
  });

  if (status === 'loading') {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 bg-background-primary">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand"></div>
      </div>
    );
  }

  // Colors based on status
  const getStatusColor = (status?: string) => {
    if (status === 'up') return '#10B981'; // green
    if (status === 'down') return '#EF4444'; // red
    return '#0EA5E9'; // cyan
  };

  const activeColor = getStatusColor(selectedMonitor?.status);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-transparent text-text-primary font-sans select-none">
      
      {/* LEFT SIDEBAR: Monitors List */}
      <aside className="w-80 border-r border-surface-border bg-white/70 backdrop-blur-md flex flex-col flex-shrink-0 z-20">
        {/* Header */}
        <div className="p-4 border-b border-surface-border flex items-center justify-between">
          <h1 className="flex items-center gap-2">
            <Activity className="w-6 h-6 text-brand" />
            <span className="text-lg font-extrabold tracking-tight text-gradient">MONSERV</span>
          </h1>
        </div>

        {/* Search */}
        <div className="p-3 border-b border-surface-border">
          <div className="relative">
            <Search className="w-4 h-4 text-text-muted absolute left-3 top-3.5" />
            <input
              type="text"
              placeholder="Search monitors..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full bg-background-tertiary border border-surface-border rounded-xl pl-9 pr-3 py-2.5 text-sm text-text-primary placeholder-text-muted focus:outline-none focus:border-brand/40 transition-colors"
            />
          </div>
        </div>

        {/* Small stats banner */}
        <div className="px-4 py-3 bg-background-tertiary/40 border-b border-surface-border flex items-center justify-between text-xs text-text-secondary">
          <div className="flex items-center gap-1.5">
            <span className="status-dot up w-2 h-2" />
            <span>{stats.up} Up</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="status-dot down w-2 h-2" />
            <span>{stats.down} Down</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-text-muted" />
            <span>{stats.avgLatency}ms</span>
          </div>
        </div>

        {/* Scrollable list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-10">
              <div className="w-5 h-5 border-2 border-brand border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredMonitors.length === 0 ? (
            <div className="text-center py-10 text-xs text-text-muted">
              No monitors found
            </div>
          ) : (
            filteredMonitors.map(m => {
              const isSelected = selectedMonitorId === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelectedMonitorId(m.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all flex items-center justify-between gap-3 ${
                    isSelected 
                      ? 'bg-gradient-to-r from-brand/5 to-brand-hover/5 border border-brand/20 shadow-[0_2px_8px_rgba(0,0,0,0.03)]' 
                      : 'border border-transparent hover:bg-background-tertiary/60 hover:border-surface-border'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className={`status-dot ${m.status === 'up' ? 'up' : m.status === 'down' ? 'down' : 'pending'} w-2 h-2`} />
                      <span className="font-semibold text-sm truncate block" style={{ color: 'var(--text-primary)' }}>{m.name}</span>
                    </div>
                    <span className="text-[11px] font-mono text-text-muted truncate block mt-0.5">{m.url}</span>
                  </div>
                  
                  <div className="text-right flex-shrink-0">
                    <span className="text-[11px] font-mono text-text-secondary">{(m.uptime ?? 100).toFixed(1)}%</span>
                    {m.latency && (
                      <span className="text-[10px] text-text-muted block font-mono">{m.latency}ms</span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Bottom Panel */}
        <div className="p-3 border-t border-surface-border bg-background-tertiary/40 flex flex-col gap-2">
          {/* Account profile link */}
          <div className="flex items-center justify-between py-1.5 px-2">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-brand/10 border border-brand/20 flex items-center justify-center text-brand font-bold text-sm">
                {session?.user?.name?.charAt(0) || session?.user?.email?.charAt(0) || 'A'}
              </div>
              <div className="min-w-0">
                <span className="text-xs font-semibold block truncate" style={{ color: 'var(--text-primary)' }}>{session?.user?.name || session?.user?.email || 'Admin User'}</span>
                <span className="text-[10px] text-text-muted block">System Admin</span>
              </div>
            </div>

            <button 
              onClick={() => signOut()} 
              title="Sign Out"
              className="p-1.5 rounded-lg hover:bg-background-tertiary text-text-muted hover:text-neon-red transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>

          <div className="text-xs">
            <a 
              href="/status" 
              target="_blank"
              className="w-full flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-background-tertiary border border-surface-border text-text-secondary hover:text-brand hover:border-brand/30 transition-all font-medium"
            >
              <Globe className="w-3.5 h-3.5 text-brand" />
              Public Status Board
            </a>
          </div>

          <button
            onClick={() => setSelectedMonitorId('new')}
            className="w-full btn-primary py-2.5 flex items-center justify-center gap-2 text-sm shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Create Monitor
          </button>
        </div>
      </aside>

      {/* CENTER CANVAS & TELEMETRY PANELS */}
      <main className="flex-1 flex flex-col min-w-0 bg-transparent relative overflow-hidden">
        {/* Soft center glow */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[300px] bg-gradient-to-r from-brand/10 to-brand-hover/10 rounded-full filter blur-[80px] opacity-40 pointer-events-none" />

        {/* Canvas background grid */}
        <div 
          className="absolute inset-0 opacity-[0.015] pointer-events-none" 
          style={{
            backgroundImage: 'radial-gradient(var(--text-primary) 1.5px, transparent 0)',
            backgroundSize: '24px 24px'
          }}
        />

        {/* Selected Monitor flow canvas (upper panel) */}
        <div className="flex-[1.2] flex items-center justify-center relative p-6 min-h-0 border-b border-surface-border bg-transparent">
          {selectedMonitor ? (() => {
            const targetToEngineColor = selectedMonitorId === 'new' 
              ? '#EF4444' 
              : (selectedMonitor.status === 'up' ? '#10B981' : '#EF4444');

            const engineToWebhookColor = selectedMonitorId === 'new'
              ? '#EF4444'
              : (selectedMonitor.webhookUrl ? '#10B981' : '#EF4444');

            return (
              <div className="w-full max-w-5xl h-[280px] relative flex justify-between items-center px-4 md:px-8 z-10">
                
                {/* NODE 1: REQUEST TARGET */}
                <div className="w-[220px] bg-background-secondary border border-surface-border p-4 rounded-2xl relative z-10 shadow-sm flex flex-col gap-3">
                  <div className="flex items-center gap-2.5">
                    <div className="w-8 h-8 rounded-xl bg-brand/10 border border-brand/20 flex items-center justify-center text-brand">
                      <Globe className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Target configuration</h4>
                      <span className="text-sm font-bold text-gray-800 block leading-tight">Request Details</span>
                    </div>
                  </div>
                  
                  <div className="h-px bg-surface-border" />
                  
                  <div className="space-y-1.5 text-xs text-text-secondary">
                    <div className="flex justify-between">
                      <span>Target Type:</span>
                      <span className="font-bold uppercase font-mono">{selectedMonitor.type}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Interval Check:</span>
                      <span className="font-bold font-mono">{selectedMonitor.interval}s</span>
                    </div>
                    {selectedMonitor.port && (
                      <div className="flex justify-between">
                        <span>TCP Port:</span>
                        <span className="font-bold font-mono">{selectedMonitor.port}</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* LINE 1: Target to Check Engine */}
                {mounted && (
                  <div className="flex-1 min-w-[32px] px-2 relative flex items-center">
                    <svg className="w-full h-[6px] overflow-visible" preserveAspectRatio="none">
                      <line x1="0" y1="3" x2="100%" y2="3" stroke="#E5E7EB" strokeWidth="3.5" strokeLinecap="round" />
                      <line 
                        x1="0" y1="3" x2="100%" y2="3" 
                        stroke={targetToEngineColor} 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                        className="flow-line-animated"
                        style={{ filter: `drop-shadow(0 0 6px ${targetToEngineColor}40)` }}
                      />
                    </svg>
                  </div>
                )}

                {/* NODE 2: PROTOCOL ENGINE (CHECK) */}
                <div 
                  className="w-[260px] bg-background-secondary border p-5 rounded-3xl relative z-10 shadow-md flex flex-col gap-4 transition-all duration-300"
                  style={{
                    borderColor: activeColor,
                    boxShadow: `0 8px 30px rgba(0,0,0,0.03), 0 0 16px -4px ${activeColor}25`
                  }}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-2xl flex items-center justify-center"
                           style={{ backgroundColor: `${activeColor}10`, border: `1px solid ${activeColor}25` }}>
                        {selectedMonitor.type === 'http' ? <Globe className="w-4.5 h-4.5" style={{ color: activeColor }} /> :
                         selectedMonitor.type === 'tcp' ? <Server className="w-4.5 h-4.5" style={{ color: activeColor }} /> :
                         <Shield className="w-4.5 h-4.5" style={{ color: activeColor }} />}
                      </div>
                      <div className="min-w-0">
                        <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Check engine</h4>
                        <span className="text-sm font-extrabold text-gray-900 block truncate">{selectedMonitor.name}</span>
                      </div>
                    </div>

                    {selectedMonitorId !== 'new' && (
                      <button 
                        onClick={() => handleNodePlayTest(selectedMonitor.id)}
                        disabled={runningNodeCheck}
                        title="Run check immediately"
                        className="p-1.5 rounded-xl bg-background-tertiary border border-surface-border text-text-secondary hover:text-brand hover:border-brand transition-all active:scale-95"
                      >
                        <Play className={`w-3 h-3 fill-current ${runningNodeCheck ? 'animate-spin' : ''}`} />
                      </button>
                    )}
                  </div>

                  <div className="bg-background-tertiary/70 border border-surface-border rounded-xl p-2.5 text-xs">
                    <span className="font-mono text-text-secondary truncate block select-text">{selectedMonitor.url}</span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Uptime</span>
                    <span className="font-bold font-mono text-gray-800">{(selectedMonitor.uptime || 100).toFixed(1)}%</span>
                  </div>

                  <div className="h-px bg-surface-border" />

                  <div className="flex items-center justify-between">
                    <span className="text-xs text-text-secondary">Latency</span>
                    <div className="flex items-center gap-1.5">
                      {selectedMonitor.latency && (
                        <span className="text-xs font-mono font-bold text-gray-800 px-1.5 py-0.5 bg-background-tertiary rounded-lg border border-surface-border">
                          {selectedMonitor.latency}ms
                        </span>
                      )}
                      <span 
                        className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-lg border"
                        style={{ 
                          color: activeColor, 
                          borderColor: `${activeColor}25`,
                          backgroundColor: `${activeColor}08` 
                        }}
                      >
                        {selectedMonitor.status === 'up' ? 'Online' : selectedMonitor.status === 'down' ? 'Offline' : 'Pending'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* LINE 2: Check Engine to Webhook Integration */}
                {mounted && (
                  <div className="flex-1 min-w-[32px] px-2 relative flex items-center">
                    <svg className="w-full h-[6px] overflow-visible" preserveAspectRatio="none">
                      <line x1="0" y1="3" x2="100%" y2="3" stroke="#E5E7EB" strokeWidth="3.5" strokeLinecap="round" />
                      <line 
                        x1="0" y1="3" x2="100%" y2="3" 
                        stroke={engineToWebhookColor} 
                        strokeWidth="3.5" 
                        strokeLinecap="round"
                        className="flow-line-animated"
                        style={{ filter: `drop-shadow(0 0 6px ${engineToWebhookColor}40)` }}
                      />
                    </svg>
                  </div>
                )}

                {/* NODE 3: WEBHOOK ALERTS */}
                <div 
                  className="w-[220px] bg-background-secondary border p-4 rounded-2xl flex flex-col gap-2.5 shadow-sm transition-all"
                  style={{ borderColor: selectedMonitor.webhookUrl ? activeColor : 'var(--surface-border)' }}
                >
                  <div className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${selectedMonitor.webhookUrl ? 'bg-brand/10 text-brand border border-brand/20' : 'bg-background-tertiary text-text-muted border border-transparent'}`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-text-muted">Integration</h4>
                      <span className="text-sm font-bold text-gray-800 block leading-tight">Webhook Alert</span>
                    </div>
                  </div>
                  
                  <div className="h-px bg-surface-border" />
                  
                  <span className="text-[10px] font-mono text-text-secondary truncate block select-text">
                    {selectedMonitor.webhookUrl || 'Not Configured'}
                  </span>
                  
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-text-muted">Webhook Alert:</span>
                    <span className={`font-bold ${selectedMonitor.webhookUrl ? 'text-status-green' : 'text-text-muted'}`}>
                      {selectedMonitor.webhookUrl ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                </div>

              </div>
            );
          })() : (
            <div className="text-center max-w-sm glass-card p-8 border border-surface-border">
              <Database className="w-10 h-10 text-brand mx-auto mb-4 animate-bounce" />
              <h3 className="text-base font-bold">No Selected Monitor</h3>
              <p className="text-xs text-text-secondary mt-2 mb-6">
                Choose an active monitor from the sidebar or click Create Monitor to configure your check flow.
              </p>
              <button onClick={() => setSelectedMonitorId('new')} className="btn-primary flex items-center gap-2 mx-auto">
                <Plus className="w-4 h-4" /> Setup Monitor Flow
              </button>
            </div>
          )}
        </div>

        {/* Live Telemetry & Logs bottom panel */}
        <div className="flex-[0.8] bg-white/70 backdrop-blur-md p-5 flex flex-col overflow-hidden z-10">
          {selectedMonitor && selectedMonitorId !== 'new' ? (
            <div className="flex-1 flex flex-col min-h-0">
              
              {/* Tab Selector */}
              <div className="flex items-center justify-between border-b border-surface-border pb-3 mb-4 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-brand" />
                  <h3 className="text-sm font-bold text-gray-800">Live Telemetry & Logs Dashboard</h3>
                </div>

                <div className="flex bg-background-tertiary p-0.5 rounded-lg text-xs">
                  <button
                    onClick={() => setCenterActiveTab('telemetry')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                      centerActiveTab === 'telemetry'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-text-secondary hover:text-gray-900'
                    }`}
                  >
                    <BarChart2 className="w-3.5 h-3.5" />
                    Performance & Uptime
                  </button>
                  <button
                    onClick={() => setCenterActiveTab('logs')}
                    className={`px-3 py-1 rounded-md font-semibold transition-all flex items-center gap-1.5 ${
                      centerActiveTab === 'logs'
                        ? 'bg-white text-gray-900 shadow-sm'
                        : 'text-text-secondary hover:text-gray-900'
                    }`}
                  >
                    <List className="w-3.5 h-3.5" />
                    Activity Logs
                  </button>
                </div>
              </div>

              {/* Tab Content */}
              <div className="flex-1 min-h-0 overflow-y-auto">
                
                {/* 1. Telemetry and Charts */}
                {centerActiveTab === 'telemetry' && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 h-full items-start">
                    
                    {/* Left stats & Uptime blocks */}
                    <div className="space-y-4 md:col-span-1">
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 bg-background-tertiary/75 border border-surface-border rounded-xl">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider block">Avg Latency</span>
                          <span className="text-lg font-bold font-mono text-gray-800 mt-0.5 block">
                            {chartData.length > 0 ? Math.round(chartData.reduce((acc, c) => acc + c.latency, 0) / chartData.length) : 0}ms
                          </span>
                        </div>
                        <div className="p-3 bg-background-tertiary/75 border border-surface-border rounded-xl">
                          <span className="text-[10px] text-text-muted uppercase tracking-wider block">Availability</span>
                          <span className="text-lg font-bold font-mono text-gray-800 mt-0.5 block">
                            {selectedMonitor.uptime?.toFixed(1) || 100}%
                          </span>
                        </div>
                      </div>

                      {/* Uptime Blocks */}
                      <div className="p-4 bg-background-tertiary/45 border border-surface-border rounded-2xl">
                        <div className="flex items-center justify-between text-xs mb-2 text-text-secondary">
                          <span className="font-semibold">Uptime History (24h)</span>
                          <span className="text-[10px] text-text-muted">60 blocks</span>
                        </div>
                        
                        <div className="flex gap-0.5 h-6 items-end justify-between">
                          {blocks.map((block, i) => (
                            <div
                              key={i}
                              className={`flex-1 h-4 rounded-[2px] transition-all hover:scale-y-125 ${block.color}`}
                              title={block.status === 'none' ? 'No data' : block.status === 'down' ? 'Down' : 'Operational'}
                            />
                          ))}
                        </div>
                        
                        <div className="flex justify-between text-[9px] text-text-muted mt-2">
                          <span>24h ago</span>
                          <span>Now</span>
                        </div>
                      </div>
                    </div>

                    {/* Recharts chart */}
                    <div className="md:col-span-2 h-[150px] bg-background-tertiary/40 border border-surface-border rounded-2xl p-3 flex flex-col justify-between">
                      {chartData.length < 2 ? (
                        <div className="flex-1 flex items-center justify-center text-xs text-text-muted">
                          Collecting latency records to chart...
                        </div>
                      ) : (
                        mounted && (
                          <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                              <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.03)" />
                              <XAxis dataKey="time" stroke="#9CA3AF" fontSize={8} tickLine={false} />
                              <YAxis stroke="#9CA3AF" fontSize={8} unit="ms" tickLine={false} />
                              <Tooltip 
                                contentStyle={{ 
                                  backgroundColor: '#FFFFFF', 
                                  borderColor: 'rgba(0,0,0,0.08)',
                                  borderRadius: '8px',
                                  color: '#111827',
                                  fontSize: '10px',
                                  boxShadow: '0 4px 12px rgba(0,0,0,0.05)'
                                }} 
                              />
                              <Line type="monotone" dataKey="latency" stroke="#7C3AED" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        )
                      )}
                    </div>

                  </div>
                )}

                {/* 2. Live logs list */}
                {centerActiveTab === 'logs' && (
                  <div className="space-y-2 max-h-[140px] overflow-y-auto pr-1">
                    {heartbeats.length === 0 ? (
                      <div className="text-center py-6 text-xs text-text-muted">
                        No heartbeat logs recorded. Running checking scheduler...
                      </div>
                    ) : (
                      heartbeats.map((log, index) => (
                        <div key={log.id || index} className="p-2.5 bg-background-tertiary border border-surface-border rounded-xl flex items-center justify-between gap-3 text-xs">
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
            <div className="text-center py-10 text-xs text-text-muted">
              Select a monitor from the left sidebar to display real-time latency graphs, availability reports, and heartbeat checks history.
            </div>
          )}
        </div>
      </main>

      {/* RIGHT SIDEBAR: Configuration */}
      <aside className="w-[420px] border-l border-surface-border bg-white/70 backdrop-blur-md flex flex-col flex-shrink-0 z-20">
        
        {/* Static Header */}
        <div className="p-4 border-b border-surface-border bg-background-secondary text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-2">
          <Settings className="w-4 h-4 text-brand" />
          <span>Configure Monitor Flow</span>
        </div>

        {/* Tab Contents */}
        <div className="flex-1 overflow-y-auto p-5">
          {selectedMonitor ? (
            <form onSubmit={handleSaveMonitor} className="space-y-4">
              <div>
                <label className="label">Monitor Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="input-field"
                  placeholder="Production Server"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Protocol / Check</label>
                  <select
                    value={formData.type}
                    onChange={e => setFormData({ ...formData, type: e.target.value as any })}
                    className="select-field"
                  >
                    <option value="http">HTTP/HTTPS</option>
                    <option value="tcp">TCP Port</option>
                    <option value="icmp">ICMP Ping</option>
                  </select>
                </div>

                {formData.type === 'tcp' && (
                  <div>
                    <label className="label">TCP Port</label>
                    <input
                      type="number"
                      value={formData.port}
                      onChange={e => { const val = parseInt(e.target.value); setFormData({ ...formData, port: isNaN(val) ? '' as any : val }); }}
                      className="input-field"
                      min="1"
                      max="65535"
                    />
                  </div>
                )}
              </div>

              <div>
                <label className="label">{formData.type === 'http' ? 'Destination URL' : 'Host Address / IP'}</label>
                <input
                  type="text"
                  value={formData.url}
                  onChange={e => setFormData({ ...formData, url: e.target.value })}
                  className="input-field font-mono text-sm"
                  placeholder={formData.type === 'http' ? 'https://mywebsite.com' : '192.168.1.100'}
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Interval (Seconds)</label>
                  <input
                    type="number"
                    value={formData.interval}
                    onChange={e => { const val = parseInt(e.target.value); setFormData({ ...formData, interval: isNaN(val) ? '' as any : val }); }}
                    className="input-field"
                    min="1"
                    max="3600"
                  />
                </div>
                <div>
                  <label className="label">Timeout (Seconds)</label>
                  <input
                    type="number"
                    value={formData.timeout}
                    onChange={e => { const val = parseInt(e.target.value); setFormData({ ...formData, timeout: isNaN(val) ? '' as any : val }); }}
                    className="input-field"
                    min="1"
                    max="30"
                  />
                </div>
              </div>

              {formData.type === 'http' && (
                <div className="grid grid-cols-2 gap-4 bg-background-tertiary/40 p-3 rounded-xl border border-surface-border">
                  <div>
                    <label className="label">Expected Status</label>
                    <input
                      type="number"
                      value={formData.expectedStatus}
                      onChange={e => { const val = parseInt(e.target.value); setFormData({ ...formData, expectedStatus: isNaN(val) ? '' as any : val }); }}
                      className="input-field"
                      placeholder="200"
                    />
                  </div>
                  <div>
                    <label className="label">Match Keyword</label>
                    <input
                      type="text"
                      value={formData.keyword}
                      onChange={e => setFormData({ ...formData, keyword: e.target.value })}
                      className="input-field"
                      placeholder="optional"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="label">Slack/Discord Webhook URL</label>
                <input
                  type="url"
                  value={formData.webhookUrl}
                  onChange={e => setFormData({ ...formData, webhookUrl: e.target.value })}
                  className="input-field text-xs font-mono"
                  placeholder="https://hooks.slack.com/services/..."
                />
              </div>

              <div className="flex items-center gap-3 py-1">
                <input
                  type="checkbox"
                  id="isPublic"
                  checked={formData.isPublic}
                  onChange={e => setFormData({ ...formData, isPublic: e.target.checked })}
                  className="w-4.5 h-4.5 rounded border-surface-border bg-background-tertiary text-brand focus:ring-brand"
                />
                <label htmlFor="isPublic" className="text-xs font-semibold text-text-secondary select-none cursor-pointer">
                  Expose to Public status board
                </label>
              </div>

              <div className="h-px bg-surface-border my-5" />

              {/* Connection Test output section */}
              <AnimatePresence>
                {testResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className={`p-4 rounded-2xl border text-xs ${
                      testResult.up 
                        ? 'bg-status-green/5 border-status-green/20 text-status-green' 
                        : 'bg-status-red/5 border-status-red/20 text-status-red'
                    }`}
                  >
                    <div className="flex items-center justify-between font-bold mb-2">
                      <span className="flex items-center gap-1.5">
                        {testResult.up ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
                        {testResult.up ? 'Test Succeeded' : 'Test Failed'}
                      </span>
                      <span className="font-mono">{testResult.latency}ms latency</span>
                    </div>
                    <p className="text-text-secondary font-mono text-[11px] leading-relaxed bg-white/70 p-2 rounded-lg mt-1 border border-surface-border select-text">
                      {testResult.message}
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Save & Test Buttons */}
              <div className="flex flex-col gap-2 pt-2">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={handleTestConnection}
                    disabled={testingConnection || !formData.url}
                    className="btn-secondary py-2.5 flex items-center justify-center gap-2 text-xs"
                  >
                    {testingConnection ? (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                        Testing...
                      </>
                    ) : (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Test Connection
                      </>
                    )}
                  </button>

                  <button
                    type="submit"
                    className="btn-primary py-2.5 flex items-center justify-center gap-2 text-xs"
                  >
                    <Save className="w-3.5 h-3.5" />
                    Save Flow
                  </button>
                </div>

                {selectedMonitorId !== 'new' && (
                  <button
                    type="button"
                    onClick={() => handleDeleteMonitor(selectedMonitor.id)}
                    className="w-full mt-2 border border-status-red/20 hover:border-status-red text-status-red hover:bg-status-red/5 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    Delete Monitor Flow
                  </button>
                )}
              </div>
            </form>
          ) : (
            <div className="text-center py-20 text-xs text-text-muted">
              Create or select a monitor from the sidebar to inspect and modify its target configurations.
            </div>
          )}
        </div>
      </aside>

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: -50, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            className={`fixed top-6 right-6 z-50 flex items-center gap-3 px-5 py-3 rounded-2xl shadow-xl border backdrop-blur-md transition-all ${
              toast.type === 'success'
                ? 'bg-status-green/10 border-status-green/30 text-status-green shadow-status-green/5'
                : toast.type === 'error'
                ? 'bg-status-red/10 border-status-red/30 text-status-red shadow-status-red/5'
                : 'bg-brand/10 border-brand/30 text-brand shadow-brand/5'
            }`}
          >
            <span className="font-semibold text-sm">{toast.message}</span>
            <button
              onClick={() => setToast(null)}
              className="text-xs font-bold opacity-60 hover:opacity-100 transition-opacity ml-2"
            >
              ✕
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}