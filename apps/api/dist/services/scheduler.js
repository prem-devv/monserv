import { jsonDb } from '../db/jsonDb.js';
import axios from 'axios';
import https from 'https';
import net from 'net';
import { execFile } from 'child_process';
import { promisify } from 'util';
const execFileAsync = promisify(execFile);
// ── Lazy-loaded nodemailer (avoid blocking startup if SMTP unused) ──────
let nodemailer = null;
async function getNodemailer() {
    if (!nodemailer) {
        nodemailer = await import('nodemailer');
    }
    return nodemailer.default || nodemailer;
}
// ── Scheduling state ────────────────────────────────────────────────────
const intervals = new Map();
const running = new Set(); // guards against overlapping checks
const runningSince = new Map(); // timestamp when check started (for hung watchdog)
const lastStatus = new Map();
const failureCount = new Map();
/**
 * Consecutive failures required before a monitor is confirmed DOWN.
 * 3 provides resilience against transient network blips while still
 * detecting real outages quickly (with the 2-second retry on first failure,
 * a real outage is confirmed in ~4 seconds).
 */
const FAILURE_THRESHOLD = 3;
/** If a check runs longer than this multiple of its configured timeout,
 *  the watchdog forcibly clears the running flag and allows the next tick. */
const HUNG_CHECK_MULTIPLIER = 3; // 3× timeout → force-reset
// ── Shared HTTPS agent with keep-alive ──────────────────────────────────
const globalHttpsAgent = new https.Agent({
    rejectUnauthorized: false,
    keepAlive: true,
    maxSockets: 50,
    keepAliveMsecs: 30000,
});
// ── Webhook notification ────────────────────────────────────────────────
async function sendWebhookNotification(webhookUrl, monitor, status, message) {
    try {
        const emoji = status === 'up' ? '✅' : '🔴';
        const statusText = status === 'up' ? 'RECOVERED' : 'DOWN';
        const msgText = `${emoji} *Monserv Alert*\n` +
            `Monitor: *${monitor.name}*\n` +
            `Status: *${statusText}*\n` +
            `Type: ${monitor.type.toUpperCase()}\n` +
            `Target: ${monitor.url}\n` +
            `Message: ${message}\n` +
            `Time: ${new Date().toISOString()}`;
        const isDiscord = webhookUrl.toLowerCase().includes('discord.com');
        await axios.post(webhookUrl, isDiscord ? { content: msgText } : { text: msgText }, { timeout: 10000 });
        console.log(`[WEBHOOK] Sent ${statusText} for monitor ${monitor.id}`);
    }
    catch (err) {
        console.error(`[WEBHOOK ERROR] monitor=${monitor.id}:`, err?.message);
    }
}
// ── Email notification ──────────────────────────────────────────────────
async function sendEmailNotification(settings, monitor, status, message) {
    try {
        const nm = await getNodemailer();
        const transporter = nm.createTransport({
            host: settings.smtpHost,
            port: settings.smtpPort,
            secure: settings.smtpPort === 465,
            auth: settings.smtpUser
                ? { user: settings.smtpUser, pass: settings.smtpPass }
                : undefined,
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
    }
    catch (err) {
        console.error(`[EMAIL ERROR] monitor=${monitor.id}:`, err?.message || err);
    }
}
// ── Single check execution ──────────────────────────────────────────────
export async function executeSingleCheck(type, url, port, timeout, keyword, expectedStatus) {
    const start = Date.now();
    try {
        if (type === 'http') {
            const controller = new AbortController();
            const timeoutMs = timeout * 1000;
            const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
            // Helper: single HTTP attempt
            const attempt = async () => {
                const response = await axios.get(url, {
                    timeout: timeoutMs,
                    validateStatus: () => true,
                    httpsAgent: globalHttpsAgent,
                    signal: controller.signal,
                    headers: {
                        'User-Agent': 'Monserv/1.0 (Monitoring Check)',
                        'Cache-Control': 'no-cache',
                        Connection: 'keep-alive',
                    },
                });
                const lat = Date.now() - start;
                let up;
                let msg;
                if (expectedStatus !== null && expectedStatus !== undefined) {
                    up = response.status === expectedStatus;
                    msg = `HTTP ${response.status}${!up ? ` (Expected ${expectedStatus})` : ''}`;
                }
                else {
                    up = response.status >= 200 && response.status < 400;
                    msg = `HTTP ${response.status}`;
                }
                if (up && keyword) {
                    const bodyString = typeof response.data === 'string'
                        ? response.data
                        : JSON.stringify(response.data);
                    if (!bodyString.includes(keyword)) {
                        up = false;
                        msg = `Keyword "${keyword}" not found`;
                    }
                }
                return { up, latency: lat, message: msg };
            };
            try {
                const result = await attempt();
                clearTimeout(timeoutId);
                return result;
            }
            catch (err) {
                clearTimeout(timeoutId);
                const latency = Date.now() - start;
                // Normalise cancel/timeout detection across axios versions
                const isCancel = err?.code === 'ECONNABORTED' ||
                    err?.code === 'ERR_CANCELED' ||
                    err?.name === 'CanceledError' ||
                    err?.name === 'AbortError' ||
                    err?.message?.includes('canceled');
                if (isCancel) {
                    return { up: false, latency, message: 'Connection timeout' };
                }
                // Retry once on connection-level errors (stale keepAlive socket, reset)
                const isConnectionError = err?.code === 'ECONNRESET' ||
                    err?.code === 'ECONNREFUSED' ||
                    err?.code === 'ETIMEDOUT' ||
                    err?.code === 'EPIPE' ||
                    err?.code === 'ERR_SOCKET_CLOSED' ||
                    err?.code === 'UND_ERR_SOCKET';
                if (isConnectionError) {
                    console.log(`[RETRY] monitor=${type} ${url}: connection error "${err?.code}", retrying once`);
                    try {
                        // Create a fresh controller for the retry
                        const retryController = new AbortController();
                        const retryTimeoutId = setTimeout(() => retryController.abort(), timeoutMs);
                        const retryResponse = await axios.get(url, {
                            timeout: timeoutMs,
                            validateStatus: () => true,
                            httpsAgent: new https.Agent({
                                rejectUnauthorized: false,
                                keepAlive: false, // fresh connection for retry
                            }),
                            signal: retryController.signal,
                            headers: {
                                'User-Agent': 'Monserv/1.0 (Monitoring Check)',
                                'Cache-Control': 'no-cache',
                            },
                        });
                        clearTimeout(retryTimeoutId);
                        const retryLatency = Date.now() - start;
                        let up;
                        let msg;
                        if (expectedStatus !== null && expectedStatus !== undefined) {
                            up = retryResponse.status === expectedStatus;
                            msg = `HTTP ${retryResponse.status}${!up ? ` (Expected ${expectedStatus})` : ''}`;
                        }
                        else {
                            up = retryResponse.status >= 200 && retryResponse.status < 400;
                            msg = `HTTP ${retryResponse.status}`;
                        }
                        if (up && keyword) {
                            const bodyString = typeof retryResponse.data === 'string'
                                ? retryResponse.data
                                : JSON.stringify(retryResponse.data);
                            if (!bodyString.includes(keyword)) {
                                up = false;
                                msg = `Keyword "${keyword}" not found`;
                            }
                        }
                        return { up, latency: retryLatency, message: msg };
                    }
                    catch (retryErr) {
                        // Retry also failed — return the original error
                    }
                }
                return {
                    up: false,
                    latency,
                    message: err?.message || 'Request failed',
                };
            }
        }
        if (type === 'tcp') {
            const host = url.replace(/^(?:https?:\/\/)?/, '').split(/[/?#:]/)[0];
            const effectivePort = port ?? 80;
            return new Promise((resolve) => {
                let settled = false;
                const done = (up, msg) => {
                    if (!settled) {
                        settled = true;
                        resolve({ up, latency: Date.now() - start, message: msg });
                    }
                };
                const socket = new net.Socket();
                const timer = setTimeout(() => {
                    socket.destroy();
                    done(false, 'Connection timeout');
                }, timeout * 1000);
                socket.connect(effectivePort, host, () => {
                    clearTimeout(timer);
                    socket.destroy();
                    done(true, `Connected to port ${effectivePort}`);
                });
                socket.on('error', (err) => {
                    clearTimeout(timer);
                    socket.destroy();
                    done(false, err.message);
                });
            });
        }
        if (type === 'icmp') {
            const host = url.replace(/^(?:https?:\/\/)?/, '').split(/[/?#:]/)[0];
            console.log(`[ICMP] Pinging: ${host}`);
            try {
                const { stdout } = await execFileAsync('ping', ['-c', '1', '-W', String(timeout), host], { timeout: (timeout + 2) * 1000, killSignal: 'SIGTERM' });
                const rttMatch = stdout.match(/rtt[^=]+=\s*[\d.]+\/([\d.]+)\//);
                const latency = rttMatch ? parseFloat(rttMatch[1]) : Date.now() - start;
                console.log(`[ICMP] ${host} UP, latency=${latency.toFixed(1)}ms`);
                return {
                    up: true,
                    latency,
                    message: `Ping OK (${latency.toFixed(1)}ms)`,
                };
            }
            catch {
                console.log(`[ICMP] ${host} DOWN`);
                return {
                    up: false,
                    latency: timeout * 1000,
                    message: 'Ping timeout or unreachable',
                };
            }
        }
        // Unknown type — report as untested
        return {
            up: true,
            latency: Date.now() - start,
            message: `${type} check not implemented`,
        };
    }
    catch (error) {
        return {
            up: false,
            latency: Date.now() - start,
            message: error?.message || 'Check failed',
        };
    }
}
// ── Run a full check cycle for one monitor ──────────────────────────────
async function runCheck(monitorId, type, url, port, timeout, keyword, expectedStatus) {
    const { up, latency, message } = await executeSingleCheck(type, url, port, timeout, keyword ?? null, expectedStatus ?? null);
    const previousStatus = lastStatus.get(monitorId);
    const currentFailures = failureCount.get(monitorId) || 0;
    let confirmedStatus;
    if (up) {
        failureCount.set(monitorId, 0);
        confirmedStatus = 'up';
    }
    else {
        const newFailures = currentFailures + 1;
        failureCount.set(monitorId, newFailures);
        if (newFailures >= FAILURE_THRESHOLD) {
            confirmedStatus = 'down';
            console.log(`[CONFIRM DOWN] monitor=${monitorId} failed ${newFailures}/${FAILURE_THRESHOLD}`);
        }
        else {
            confirmedStatus = previousStatus ?? 'up';
            console.log(`[PENDING] monitor=${monitorId} failure ${newFailures}/${FAILURE_THRESHOLD}, keeping ${confirmedStatus}`);
        }
    }
    console.log(`[HEARTBEAT] monitor=${monitorId} type=${type} raw=${up ? 'up' : 'down'} ` +
        `confirmed=${confirmedStatus} latency=${latency}ms msg="${message}"`);
    // Persist heartbeat (in-memory immediate, disk write debounced by jsonDb)
    jsonDb.heartbeats.create({
        monitorId,
        status: confirmedStatus,
        latency,
        message,
        createdAt: Date.now(),
    });
    // Fire notifications on genuine state transitions only
    const isTransition = previousStatus !== undefined
        ? previousStatus !== confirmedStatus
        : confirmedStatus === 'down'; // initial DOWN alert; no alert for initial UP
    if (isTransition) {
        const monitor = jsonDb.monitors.findFirst(monitorId);
        if (monitor) {
            console.log(`[NOTIFY] monitor=${monitorId} state change: ${previousStatus ?? 'none'} → ${confirmedStatus}`);
            // Webhook — fire-and-forget (errors caught internally)
            if (monitor.webhookUrl) {
                sendWebhookNotification(monitor.webhookUrl, monitor, confirmedStatus, message);
            }
            // Email — fire-and-forget (errors caught internally)
            const settings = jsonDb.settings.get();
            if (settings?.smtpHost && settings?.notificationEmail) {
                sendEmailNotification(settings, monitor, confirmedStatus, message);
            }
        }
    }
    lastStatus.set(monitorId, confirmedStatus);
    return confirmedStatus;
}
// ── Scheduling ──────────────────────────────────────────────────────────
export async function scheduleAllMonitors() {
    const monitors = jsonDb.monitors.findMany().filter((m) => m.active);
    // Stagger initial checks with random jitter (1-15s) so all monitors
    // don't fire simultaneously on cold start. Uptime-Kuma does the same.
    for (const monitor of monitors) {
        const jitterMs = 1000 + Math.floor(Math.random() * 14000); // 1–15 s
        _registerInterval(monitor.id, monitor.interval, jitterMs);
    }
    console.log(`Scheduled ${monitors.length} monitors with startup jitter`);
}
/**
 * Schedule (or re-schedule) a single monitor.
 * Runs an immediate check by default so the caller gets live status.
 */
export async function scheduleMonitorWithInterval(monitorId, intervalSeconds, runImmediate = true) {
    const monitor = jsonDb.monitors.findFirst(monitorId);
    if (!monitor || !monitor.active)
        return;
    cancelMonitorSchedule(monitorId);
    if (runImmediate) {
        await runCheck(monitorId, monitor.type, monitor.url, monitor.port, monitor.timeout, monitor.keyword, monitor.expectedStatus);
    }
    _registerInterval(monitorId, intervalSeconds);
}
/**
 * Internal: register the recursive timeout tick for a monitor.
 * Uses a running-guard so a hung check can never spawn a second overlapping tick.
 */
function _registerInterval(monitorId, intervalSeconds, initialDelayMs) {
    const monitor = jsonDb.monitors.findFirst(monitorId);
    if (!monitor || !monitor.active)
        return;
    // Clear any prior registration
    const existing = intervals.get(monitorId);
    if (existing) {
        clearTimeout(existing);
        intervals.delete(monitorId);
    }
    const intervalMs = intervalSeconds * 1000;
    const scheduleNext = (delayMs) => {
        const timerId = setTimeout(async () => {
            const currentMonitor = jsonDb.monitors.findFirst(monitorId);
            if (!currentMonitor || !currentMonitor.active) {
                intervals.delete(monitorId);
                running.delete(monitorId);
                return;
            }
            // Guard: if a check is still in-flight, skip this tick.
            // The running check's finally-block will re-arm the timer — we must NOT
            // call scheduleNext here, or we create a second armed timer (double-schedule
            // bug that causes overlapping checks and false DOWN states).
            if (running.has(monitorId)) {
                const startedAt = runningSince.get(monitorId) || 0;
                const hungDuration = Date.now() - startedAt;
                const maxSafeDuration = (currentMonitor.timeout || 10) * 1000 * HUNG_CHECK_MULTIPLIER;
                if (hungDuration > maxSafeDuration) {
                    // Watchdog: check has been "running" too long — the finally block
                    // likely threw or the timer was orphaned. Force-reset and proceed.
                    console.error(`[WATCHDOG] monitor=${monitorId}: check hung for ${hungDuration}ms ` +
                        `(max ${maxSafeDuration}ms). Force-resetting running flag.`);
                    running.delete(monitorId);
                    runningSince.delete(monitorId);
                    // Fall through to start a fresh check below
                }
                else {
                    console.log(`[SKIP] monitor=${monitorId}: previous check still running ` +
                        `(${hungDuration}ms elapsed), skipping tick`);
                    // DO NOT re-schedule. The running check's finally block will re-arm.
                    return;
                }
            }
            running.add(monitorId);
            runningSince.set(monitorId, Date.now());
            let nextDelay = intervalMs;
            try {
                const confirmedStatus = await runCheck(monitorId, currentMonitor.type, currentMonitor.url, currentMonitor.port, currentMonitor.timeout, currentMonitor.keyword, currentMonitor.expectedStatus);
                // Uptime-Kuma-style fast retries when failing but not yet confirmed DOWN
                const fails = failureCount.get(monitorId) || 0;
                if (fails > 0 && fails < FAILURE_THRESHOLD) {
                    nextDelay = 2000; // 2-second retry for quick outage confirmation
                }
            }
            catch (err) {
                console.error(`[SCHEDULE ERROR] monitor=${monitorId}:`, err?.message);
            }
            finally {
                running.delete(monitorId);
                runningSince.delete(monitorId);
                // Re-arm only if this monitor is still meant to be scheduled.
                // This is the ONE place where the next tick is scheduled —
                // nowhere else should call scheduleNext for this monitor.
                if (intervals.has(monitorId)) {
                    scheduleNext(nextDelay);
                }
            }
        }, delayMs);
        intervals.set(monitorId, timerId);
    };
    scheduleNext(initialDelayMs ?? intervalMs);
    console.log(`Monitor ${monitorId}: interval ${intervalSeconds}s registered` +
        (initialDelayMs ? ` (first check in ${(initialDelayMs / 1000).toFixed(1)}s)` : ''));
}
export function cancelMonitorSchedule(monitorId) {
    const existing = intervals.get(monitorId);
    if (existing) {
        clearTimeout(existing);
        intervals.delete(monitorId);
        failureCount.delete(monitorId);
        running.delete(monitorId);
        runningSince.delete(monitorId);
        console.log(`Cancelled schedule for monitor ${monitorId}`);
    }
}
// ── Re-exports ──────────────────────────────────────────────────────────
export { getUptimePercentage } from '../utils/uptime.js';
export { scheduleMonitorWithInterval as scheduleMonitor };
