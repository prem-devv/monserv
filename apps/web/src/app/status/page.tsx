'use client';

import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Globe, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { api, PublicStatus } from '@/lib/api';
import { formatDistanceToNow } from 'date-fns';

export default function PublicStatusPage() {
  const [status, setStatus] = useState<PublicStatus | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 60000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const data = await api.getPublicStatus();
      setStatus(data);
    } catch (error) {
      console.error('Failed to fetch status:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!status || status.monitors.length === 0) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center">
        <Globe className="w-16 h-16 text-text-muted mb-4" />
        <h1 className="text-2xl font-bold mb-2">No Public Services</h1>
        <p className="text-text-secondary">No monitors have been configured for public status.</p>
      </div>
    );
  }

  const statusConfig = {
    operational: {
      color: 'text-status-green',
      bgColor: 'bg-status-green shadow-[0_0_12px_#10B981]',
      borderColor: 'border-status-green/20',
      icon: CheckCircle,
      label: 'All Systems Operational',
    },
    degraded: {
      color: 'text-status-yellow',
      bgColor: 'bg-status-yellow shadow-[0_0_12px_#F59E0B]',
      borderColor: 'border-status-yellow/20',
      icon: AlertTriangle,
      label: 'Some Systems Degraded',
    },
    down: {
      color: 'text-status-red',
      bgColor: 'bg-status-red shadow-[0_0_12px_#EF4444]',
      borderColor: 'border-status-red/20',
      icon: XCircle,
      label: 'Systems Down',
    },
  };

  const config = statusConfig[status.overallStatus];
  const Icon = config.icon;

  return (
    <div className="min-h-screen">
      <div className="glass-dark sticky top-0 z-40 border-b border-surface-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <Globe className="w-5 h-5 text-brand" />
              <span className="text-lg font-extrabold tracking-tight text-gradient">MONSERV</span>
            </div>
            <div className="flex items-center gap-2">
              <span className={`w-2 h-2 rounded-full ${config.bgColor}`} />
              <span className={`text-sm font-semibold ${config.color}`}>{config.label}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={`glass-card p-8 mb-8 text-center border-2 ${config.borderColor}`}
        >
          <Icon className={`w-16 h-16 ${config.color} mx-auto mb-4`} />
          <h1 className={`text-3xl font-bold ${config.color}`}>{config.label}</h1>
          <p className="text-text-secondary mt-2">
            {status.monitors.filter(m => m.status === 'up').length} of {status.monitors.length} services running
          </p>
        </motion.div>

        <div className="glass-card overflow-hidden">
          <div className="p-4 border-b border-surface-border bg-background-tertiary/50">
            <div className="grid grid-cols-4 gap-4 text-sm font-medium text-text-secondary">
              <div className="col-span-2">Service</div>
              <div className="text-center">Status</div>
              <div className="text-right">Uptime</div>
            </div>
          </div>
          <div className="divide-y divide-surface-border">
            {status.monitors.map((monitor, index) => (
              <motion.div
                key={monitor.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="p-4 grid grid-cols-4 gap-4 items-center hover:bg-surface transition-colors"
              >
                <div className="col-span-2">
                  <p className="font-medium">{monitor.name}</p>
                  <p className="text-xs text-text-muted text-mono">{monitor.type}</p>
                </div>
                <div className="flex items-center justify-center">
                  {monitor.status === 'up' ? (
                    <div className="flex items-center gap-2 text-status-green">
                      <span className="status-dot up" />
                      <span className="text-sm">Operational</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-status-red">
                      <span className="status-dot down" />
                      <span className="text-sm">Down</span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <span className="text-mono">{monitor.uptime.toFixed(1)}%</span>
                  <p className="text-xs text-text-muted">
                    {monitor.lastCheck ? formatDistanceToNow(monitor.lastCheck, { addSuffix: true }) : '-'}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <footer className="mt-12 text-center text-text-muted text-sm">
          <p>Powered by <span className="text-neon-cyan">Monserv</span></p>
        </footer>
      </main>
    </div>
  );
}