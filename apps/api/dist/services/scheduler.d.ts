export declare function executeSingleCheck(type: string, url: string, port: number | null, timeout: number, keyword: string | null, expectedStatus: number | null): Promise<{
    up: boolean;
    latency: number;
    message: string;
}>;
export declare function scheduleAllMonitors(): Promise<void>;
/**
 * Use this when CREATING or UPDATING a monitor.
 * Runs an immediate check so the caller gets real status right away,
 * then registers the recurring interval.
 */
export declare function scheduleMonitorWithInterval(monitorId: number, intervalSeconds: number, runImmediate?: boolean): Promise<void>;
export declare function cancelMonitorSchedule(monitorId: number): void;
export declare function getUptimePercentage(monitorId: number): Promise<number>;
export { scheduleMonitorWithInterval as scheduleMonitor };
