export declare function executeSingleCheck(type: string, url: string, port: number | null, timeout: number, keyword: string | null, expectedStatus: number | null): Promise<{
    up: boolean;
    latency: number;
    message: string;
}>;
export declare function scheduleAllMonitors(): Promise<void>;
/**
 * Schedule (or re-schedule) a single monitor.
 * Runs an immediate check by default so the caller gets live status.
 */
export declare function scheduleMonitorWithInterval(monitorId: number, intervalSeconds: number, runImmediate?: boolean): Promise<void>;
export declare function cancelMonitorSchedule(monitorId: number): void;
export { getUptimePercentage } from '../utils/uptime.js';
export { scheduleMonitorWithInterval as scheduleMonitor };
