import { JsonObject, Severity } from '../../types';

export interface NotificationPayload {
  event: 'ai_cost_alert';
  alertId: string;
  severity: Severity;
  category: string;
  workload?: string | null;
  title: string;
  description: string;
  evidence: JsonObject;
  timestamp: string;
}

export interface NotificationChannel {
  type: string;
  send(payload: NotificationPayload, config: { url: string; secret?: string }): Promise<void>;
}
