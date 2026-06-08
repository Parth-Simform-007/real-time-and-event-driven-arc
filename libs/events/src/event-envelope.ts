import { v4 as uuidv4 } from 'uuid';

export interface EventEnvelope<T = unknown> {
  eventId: string;
  eventType: string;
  version: string;
  timestamp: string;
  sourceService: string;
  correlationId: string;
  payload: T;
}

export function createEventEnvelope<T>(
  eventType: string,
  sourceService: string,
  payload: T,
  correlationId?: string,
): EventEnvelope<T> {
  return {
    eventId: uuidv4(),
    eventType,
    version: '1.0',
    timestamp: new Date().toISOString(),
    sourceService,
    correlationId: correlationId || uuidv4(),
    payload,
  };
}
