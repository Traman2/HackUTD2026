import { createHmac, randomUUID } from "node:crypto";
import { DbConnection } from "../../../apps/web/src/module_bindings/index.ts";
import { graphResultSchema, type GraphManifest, type GraphResult, type SpaceGraph } from "../validation/flowchart.ts";

let pending: Promise<DbConnection> | undefined;
function connect(): Promise<DbConnection> {
  if (pending) return pending;
  const promise = new Promise<DbConnection>((resolve, reject) => {
    let connection: DbConnection | undefined;
    const timeout = setTimeout(() => { connection?.disconnect(); reject(new Error("SpacetimeDB connection timed out.")); }, 10000);
    connection = DbConnection.builder()
      .withUri(process.env.SPACETIMEDB_HOST || "http://127.0.0.1:3000")
      .withDatabaseName(process.env.SPACETIMEDB_DB_NAME || "hackutd2026")
      .onConnect(conn => { clearTimeout(timeout); resolve(conn); })
      .onConnectError((_ctx, error) => { clearTimeout(timeout); reject(error); })
      .onDisconnect(() => { pending = undefined; })
      .build();
  });
  pending = promise;
  void promise.catch(() => { if (pending === promise) pending = undefined; });
  return promise;
}

export class SpacetimeGraphStore {
  readonly jobId = randomUUID();
  private manifest: GraphManifest;
  constructor(manifest: GraphManifest) { this.manifest = manifest; }
  key() { return JSON.stringify([this.manifest.namespace, this.manifest.owner, this.manifest.spaceId]); }
  private async call(operation: string, data: Record<string, unknown> = {}) {
    const key = process.env.AGENT_API_KEY;
    if (!key) throw new Error("AGENT_API_KEY is required.");
    const payload = JSON.stringify({ audience: "flowchart-store", operation, data, jobId: this.jobId,
      namespace: this.manifest.namespace, owner: this.manifest.owner, spaceId: this.manifest.spaceId, expiresAt: Date.now() + 60000 });
    const signature = createHmac("sha256", key).update(payload).digest("hex");
    const connection = await connect();
    const response = await connection.procedures.agentFlowchartStore({ payload, signature });
    return JSON.parse(response);
  }
  async get(_manifest: GraphManifest): Promise<GraphResult> { return graphResultSchema.parse(await this.call("get")); }
  async begin(_manifest: GraphManifest): Promise<boolean> { return (await this.call("begin", { fingerprint: this.manifest.fingerprint })).started === true; }
  async heartbeat() { await this.call("heartbeat"); }
  async stage(_manifest: GraphManifest, stage: string) { await this.call("stage", { stage }); }
  async fail(_manifest: GraphManifest, error: string) { await this.call("fail", { error }); }
  async getPageFindings(cacheKey: string): Promise<unknown> { return this.call("cacheGet", { cacheKey }); }
  async savePageFindings(cacheKey: string, findings: unknown) { await this.call("cacheSave", { cacheKey, findings }); }
  async save(_manifest: GraphManifest, graph: SpaceGraph, documents: GraphResult["documents"]) { await this.call("save", { graph, documents }); }
  async checkpoint(graph: SpaceGraph, documents: GraphResult["documents"], stage: string) { await this.call("checkpoint", { graph, documents, stage }); }
}
