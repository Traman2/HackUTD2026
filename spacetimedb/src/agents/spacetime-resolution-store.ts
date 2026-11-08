import { createHmac, randomUUID } from "node:crypto";
import { DbConnection } from "../../../apps/web/src/module_bindings/index.ts";
import type { Ticket } from "../validation/tickets.ts";

export type VoiceTurn = { id: string; clientTurnId: string; userTranscript: string; assistantTranscript: string; status: string };
export type VoiceSnapshot = { sessionId: string; ticketId: string; status: string; revision: number; activeStepOrder: number;
  photoRequest?: { requestId: string; clientTurnId: string; stepOrder: number; caption: string; emergency: boolean } | null;
  ticketVersion: string; ticket: Ticket; turns: VoiceTurn[];
  pendingAction: { id: string; expectedRevision: number; kind: string; stepOrder: number; status: string; result: string } | null };

// Dedicated SDK connection per voice socket; no mobile bearer token is forwarded.
export class SpacetimeResolutionStore {
  readonly connectionId = randomUUID();
  private connection?: DbConnection;
  private pending?: Promise<DbConnection>;
  readonly sessionId: string;
  readonly owner: string;
  constructor(sessionId: string, owner: string) { this.sessionId = sessionId; this.owner = owner; }
  private connect() {
    if (this.pending) return this.pending;
    this.pending = new Promise<DbConnection>((resolve, reject) => {
      const timer = setTimeout(() => { this.connection?.disconnect(); reject(new Error("Database connection timed out.")); }, 10000);
      this.connection = DbConnection.builder().withUri(process.env.SPACETIMEDB_HOST || "http://127.0.0.1:3000")
        .withDatabaseName(process.env.SPACETIMEDB_DB_NAME || "hackutd2026")
        .onConnect(conn => { clearTimeout(timer); resolve(conn); })
        .onConnectError((_ctx, error) => { clearTimeout(timer); reject(error); })
        .onDisconnect(() => { this.pending = undefined; }).build();
    });
    return this.pending;
  }
  async call<T = VoiceSnapshot>(operation: string, data: Record<string, unknown> = {}): Promise<T> {
    const key = process.env.AGENT_API_KEY;
    if (!key) throw new Error("Agent authorization is not configured.");
    const payload = JSON.stringify({ audience: "resolution-store", sessionId: this.sessionId, owner: this.owner,
      connectionId: this.connectionId, expiresAt: Date.now() + 60000, operation, data });
    const signature = createHmac("sha256", key).update(payload).digest("hex");
    const connection = await this.connect();
    return JSON.parse(await connection.procedures.agentResolutionStore({ payload, signature })) as T;
  }
  async close() {
    try { if (this.connection?.isActive) await this.call("release"); }
    finally { this.connection?.disconnect(); }
  }
}
