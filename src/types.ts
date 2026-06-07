export interface BrokerConfig {
  id: string;
  name: string;
  host: string;
  port: number;
  protocol: 'ws' | 'wss';
  path?: string;
  username?: string;
  password?: string;
}

export interface BrokerStatus {
  id: string;
  connected: boolean;
  latency: number | null;
  reconnectCount: number;
}

export type LogType = 'incoming' | 'publish' | 'error' | 'system';

export interface LogEntry {
  id: string;
  timestamp: string; // HH:mm:ss
  type: LogType;
  text: string;
}

export interface RelayLabels {
  1: string;
  2: string;
  3: string;
  4: string;
}

export interface RelayStates {
  1: boolean;
  2: boolean;
  3: boolean;
  4: boolean;
}

export interface PolaStates {
  1: boolean;
  2: boolean;
}

export interface SensorDataPoint {
  time: string; // HH:mm:ss
  suhu: number;
  kelembapan: number;
}
