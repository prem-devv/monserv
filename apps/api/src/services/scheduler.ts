import { jsonDb } from '../db/jsonDb.js';
import axios from 'axios';

const intervals: Map<number, NodeJS.Timeout> = new Map();
// Track last known status per monitor to detect state changes for webhooks
const lastStatus: Map<number, 'up' | 'down'> = new Map();

async function sendWebhookNotification(
  webhookUrl: string,
  monitor: { id: number; name: string; type: string; url: string },
  status: 'up' | 'down',
  message: string
): Promise<void> {
  try {
    const emoji = status === 'up' ? '✅' : '🔴';
    const statusText = status === 'up' ? 'RECOVERED' : 'DOWN';
    await axios.post(webhookUrl, {
      text: `${emoji} *Monserv Alert*\nMonitor: *${monitor.name}*\nStatus: *${statusText}*\nType: ${monitor.type.toUpperCase()}\nTarget: ${monitor.url}\nMessage: ${message}\nTime: ${new Date().toISOString()}`,
    }, { timeout: 10000 });
    console.log(`[WEBHOOK] Sent ${statusText} notification for monitor ${monitor.id} to ${webhookUrl}`);
  } catch (err: any) {
    console.error(`[WEBHOOK ERROR] monitor=${monitor.id}:`, err?.message);
  }
}

async function sendEmailNotification(
  settings: any,
  monitor: { id: number; name: string; type: string; url: string },
  status: 'up' | 'down',
  message: string
): Promise<void> {
  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: settings.smtpHost,
      port: settings.smtpPort,
      secure: settings.smtpPort === 465,
      auth: settings.smtpUser ? {
        user: settings.smtpUser,
        pass: settings.smtpPass,
      } : undefined,
    });

    const statusText = status === 'up' ? 'RECOVERED' : 'DOWN';
    const emoji = status === 'up' ? '✅' : '🔴';

    await transporter.sendMail({
      from: settings.smtpFrom || 'noreply@monserv.local',
      to: settings.notificationEmail,
      subject: `${emoji} [Monserv] ${monitor.name} is ${statusText}`,
      text: `Status Alert for Monitor: ${monitor.name}\n\n` +
            `New Status: ${statusText}\n` +
            `Protocol: ${monitor.type.toUpperCase()}\n` +
            `Target: ${monitor.url}\n` +
            `Details: ${message}\n` +
            `Time: ${new Date().toISOString()}\n\n` +
            `Powered by Monserv.`,
    });
    console.log(`[EMAIL] Sent ${statusText} alert for monitor ${monitor.id} to ${settings.notificationEmail}`);
  } catch (err: any) {
    console.error(`[EMAIL ERROR] Failed to send email alert for monitor ${monitor.id}:`, err.message);
  }
}

export async function executeSingleCheck(
  type: string,
  url: string,
  port: number | null,
  timeout: number,
  keyword: string | null,
  expectedStatus: number | null
): Promise<{ up: boolean; latency: number; message: string }> {
  const start = Date.now();
  let up = false;
  let latency = 0;
  let message = 'Unknown error';

  try {
    if (type === 'http') {
      const https = await import('https');
      const httpsAgent = new https.Agent({ rejectUnauthorized: false });
      const response = await axios.get(url, {
        timeout: timeout * 1000,
        validateStatus: () => true,
        httpsAgent,
      });
      latency = Date.now() - start;

      if (expectedStatus && response.status !== expectedStatus) {
        up = false;
        message = `Expected ${expectedStatus}, got ${response.status}`;
      } else if (keyword && !String(response.data).includes(keyword)) {
        up = false;
        message = `Keyword "${keyword}" not found`;
      } else {
        up = true;
        message = `HTTP ${response.status}`;
      }
    } else if (type === 'tcp') {
      const net = await import('net');
      const host = url.replace(/^(?:https?:\/\/)?/, '').split(/[/?#:]/)[0];
      const tcpResult = await new Promise<{ up: boolean; latency: number; message: string }>((resolve) => {
        const socket = new net.Socket();
        const timer = setTimeout(() => {
          socket.destroy();
          resolve({ up: false, latency: timeout * 1000, message: 'Connection timeout' });
        }, timeout * 1000);
        socket.connect(port || 80, host, () => {
          clearTimeout(timer);
          socket.destroy();
          resolve({ up: true, latency: Date.now() - start, message: `Connected to port ${port || 80}` });
        });
        socket.on('error', (err) => {
          clearTimeout(timer);
          resolve({ up: false, latency: Date.now() - start, message: err.message });
        });
      });
      up = tcpResult.up;
      latency = tcpResult.latency;
      message = tcpResult.message;
    } else if (type === 'icmp') {
      // Use child_process to call system ping directly — most reliable in Docker
      const { execFile } = await import('child_process');
      const { promisify } = await import('util');
      const execFileAsync = promisify(execFile);
      const host = url.replace(/^(?:https?:\/\/)?/, '').split(/[/?#:]/)[0];
      console.log(`[ICMP] Pinging: ${host}`);
      try {
        const { stdout } = await execFileAsync('ping', ['-c', '1', '-W', String(timeout), host], {
          timeout: (timeout + 2) * 1000,
        });
        // Parse RTT from ping output: e.g. "rtt min/avg/max/mdev = 1.234/1.234/1.234/0.000 ms"
        const rttMatch = stdout.match(/rtt[^=]+=\s*[\d.]+\/([\d.]+)\//);
        latency = rttMatch ? parseFloat(rttMatch[1]) : Date.now() - start;
        up = true;
        message = `Ping OK (${latency.toFixed(1)}ms)`;
        console.log(`[ICMP] ${host} is UP, latency=${latency}ms`);
      } catch {
        up = false;
        latency = timeout * 1000;
        message = 'Ping timeout or unreachable';
        console.log(`[ICMP] ${host} is DOWN`);
      }
    } else {
      up = true;
      latency = Date.now() - start;
      message = `${type} check not fully implemented`;
    }
  } catch (error: any) {
    up = false;
    latency = Date.now() - start;
    message = error?.message || 'Check failed';
    console.error(`[CHECK ERROR] type=${type}:`, error?.message);
  }

  return { up, latency, message };
}

async function runCheck(
  monitorId: number,
  type: string,
  url: string,
  port: number | null,
  timeout: number,
  keyword?: string | null,
  expectedStatus?: number | null
): Promise<void> {
  const { up, latency, message } = await executeSingleCheck(
    type,
    url,
    port,
    timeout,
    keyword || null,
    expectedStatus || null
  );

  const currentStatus: 'up' | 'down' = up ? 'up' : 'down';
  const previousStatus = lastStatus.get(monitorId);

  console.log(`[HEARTBEAT] monitor=${monitorId} type=${type} status=${currentStatus} latency=${latency}ms msg="${message}"`);

  jsonDb.heartbeats.create({
    monitorId,
    status: currentStatus,
    latency,
    message,
    createdAt: Date.now(),
  });

  // Fire webhook/email alert on state change (up→down or down→up)
  if (previousStatus !== undefined && previousStatus !== currentStatus) {
    const monitor = jsonDb.monitors.findFirst(monitorId);
    if (monitor) {
      if (monitor.webhookUrl) {
        console.log(`[WEBHOOK] State change for monitor ${monitorId}: ${previousStatus} → ${currentStatus}`);
        sendWebhookNotification(monitor.webhookUrl, monitor, currentStatus, message).catch(() => {});
      }
      
      const settings = jsonDb.settings.get();
      if (settings && settings.smtpHost && settings.notificationEmail) {
        console.log(`[EMAIL] State change for monitor ${monitorId}: ${previousStatus} → ${currentStatus}`);
        sendEmailNotification(settings, monitor, currentStatus, message).catch(() => {});
      }
    }
  }

  lastStatus.set(monitorId, currentStatus);
}

export async function scheduleAllMonitors() {
  const monitors = jsonDb.monitors.findMany().filter(m => m.active);
  for (const monitor of monitors) {
    // On startup: only register the interval, do NOT run an immediate check.
    // The DB already has heartbeats from before the restart — we trust those
    // and let the first naturally-timed tick produce the next result.
    // This prevents false "down" flashes caused by rapid re-scheduling on boot.
    _registerInterval(monitor.id, monitor.interval);
  }
  console.log(`Scheduled ${monitors.length} monitors`);
}

/**
 * Use this when CREATING or UPDATING a monitor.
 * Runs an immediate check so the caller gets real status right away,
 * then registers the recurring interval.
 */
export async function scheduleMonitorWithInterval(monitorId: number, intervalSeconds: number, runImmediate = true) {
  const monitor = jsonDb.monitors.findFirst(monitorId);
  if (!monitor || !monitor.active) return;

  // Cancel any existing interval but keep lastStatus so webhook state is preserved
  cancelMonitorSchedule(monitorId);

  // Run first check immediately if runImmediate is true
  if (runImmediate) {
    await runCheck(
      monitorId, monitor.type, monitor.url, monitor.port,
      monitor.timeout, monitor.keyword, monitor.expectedStatus
    );
  }

  _registerInterval(monitorId, intervalSeconds);
}

/**
 * Internal: register (or re-register) only the setInterval for a monitor.
 * Does NOT run an immediate check.
 */
function _registerInterval(monitorId: number, intervalSeconds: number) {
  const monitor = jsonDb.monitors.findFirst(monitorId);
  if (!monitor || !monitor.active) return;

  // Clear any pre-existing interval (but preserve lastStatus)
  const existing = intervals.get(monitorId);
  if (existing) {
    clearInterval(existing);
    intervals.delete(monitorId);
  }

  const intervalMs = intervalSeconds * 1000;
  const intervalId = setInterval(() => {
    runCheck(
      monitorId, monitor.type, monitor.url, monitor.port,
      monitor.timeout, monitor.keyword, monitor.expectedStatus
    ).catch(err => console.error(`[SCHEDULE ERROR] monitor=${monitorId}:`, err.message));
  }, intervalMs);

  intervals.set(monitorId, intervalId);
  console.log(`Monitor ${monitorId} interval registered every ${intervalSeconds}s`);
}

export function cancelMonitorSchedule(monitorId: number) {
  const existing = intervals.get(monitorId);
  if (existing) {
    clearInterval(existing);
    intervals.delete(monitorId);
    // NOTE: intentionally keep lastStatus so webhook logic can detect the next
    // real state change after a reschedule (e.g. on monitor edit).
    console.log(`Cancelled schedule for monitor ${monitorId}`);
  }
}

export async function getUptimePercentage(monitorId: number): Promise<number> {
  const heartbeats = jsonDb.heartbeats.findMany(monitorId, 1440);
  const cutoffTime = Date.now() - (24 * 60 * 60 * 1000);
  const recentHeartbeats = heartbeats.filter(h => h.createdAt > cutoffTime);
  if (recentHeartbeats.length === 0) return 100;
  const upCount = recentHeartbeats.filter(h => h.status === 'up').length;
  return (upCount / recentHeartbeats.length) * 100;
}

export { scheduleMonitorWithInterval as scheduleMonitor };