export interface AuditEntry {
  action: string;
  actorId: string;
  actorType: 'client' | 'user' | 'system';
  resourceType: string;
  resourceId: string;
  institutionId: string | null;
  metadata: Record<string, unknown>;
  timestamp: Date;
}

export interface AuditPort {
  record(entry: AuditEntry): Promise<void>;
}
