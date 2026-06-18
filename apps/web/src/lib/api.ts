import axios from 'axios';

const API_URL = process.env.NEXT_PUBLIC_API_URL || '/api';

// Ensure the browser never uses a stale cached response for API calls
const http = axios.create({
  headers: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    'Pragma': 'no-cache',
  },
});

export interface Monitor {
  id: number;
  name: string;
  type: 'http' | 'tcp' | 'icmp' | 'dns' | 'ssl';
  url: string;
  port?: number;
  interval: number;
  timeout: number;
  keyword?: string;
  expectedStatus?: number;
  webhookUrl?: string;
  isPublic: boolean;
  active: boolean;
  status: 'up' | 'down' | 'pending';
  latency?: number;
  uptime: number;
  createdAt: number;
  updatedAt: number;
}

export interface Heartbeat {
  id: number;
  monitorId: number;
  status: 'up' | 'down';
  latency?: number;
  message?: string;
  createdAt: number;
}

export interface PublicStatus {
  overallStatus: 'operational' | 'degraded' | 'down';
  monitors: {
    id: number;
    name: string;
    type: string;
    status: string;
    latency?: number;
    uptime: number;
    lastCheck?: number;
  }[];
}

export const api = {
  getMonitors: async (): Promise<Monitor[]> => {
    const { data } = await http.get(`${API_URL}/monitors`);
    return data;
  },

  getMonitor: async (id: number): Promise<Monitor> => {
    const { data } = await http.get(`${API_URL}/monitors/${id}`);
    return data;
  },

  createMonitor: async (monitor: Partial<Monitor>): Promise<Monitor> => {
    const { data } = await http.post(`${API_URL}/monitors`, monitor);
    return data;
  },

  updateMonitor: async (id: number, monitor: Partial<Monitor>): Promise<Monitor> => {
    const { data } = await http.put(`${API_URL}/monitors/${id}`, monitor);
    return data;
  },

  deleteMonitor: async (id: number): Promise<void> => {
    await http.delete(`${API_URL}/monitors/${id}`);
  },

  getHeartbeats: async (id: number, limit?: number): Promise<Heartbeat[]> => {
    const params = limit ? `?limit=${limit}` : '';
    const { data } = await http.get(`${API_URL}/monitors/${id}/heartbeats${params}`);
    return data;
  },

  getPublicStatus: async (): Promise<PublicStatus> => {
    const { data } = await http.get(`${API_URL}/status`);
    return data;
  },

  testWebhook: async (url: string): Promise<{ success: boolean }> => {
    const { data } = await http.post(`${API_URL}/webhooks/test`, { url });
    return data;
  },

  getSettings: async (): Promise<any> => {
    const { data } = await http.get(`${API_URL}/settings`);
    return data;
  },

  saveSettings: async (settings: any): Promise<any> => {
    const { data } = await http.post(`${API_URL}/settings`, settings);
    return data;
  },

  testMonitorConnection: async (id: number): Promise<{ up: boolean; latency: number; message: string }> => {
    const { data } = await http.post(`${API_URL}/monitors/${id}/test`);
    return data;
  },

  testDraftConnection: async (draft: Partial<Monitor>): Promise<{ up: boolean; latency: number; message: string }> => {
    const { data } = await http.post(`${API_URL}/monitors/test-connection`, draft);
    return data;
  },
};