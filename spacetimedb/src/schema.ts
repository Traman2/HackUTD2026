import { schema, t } from "spacetimedb/server";
import { users } from "./models/user";
import { sessions } from "./models/session";
import { spaces } from "./models/space";
import { documents, uploads, documentArtifacts, documentMetadata } from "./models/document";
import { flowcharts, flowchartOverviewCache } from "./models/flowchart";
import { riskAssessments, riskEvents } from "./models/risk";
import { tickets, ticketJobs, ticketPhotos, ticketEvents } from "./models/ticket";
import { resolutionSessions, resolutionTurns, resolutionActions } from "./models/resolution";

const spacetimedb = schema({ users, sessions, spaces, documents, uploads, documentArtifacts, documentMetadata, flowcharts, flowchartOverviewCache, riskAssessments, riskEvents, tickets, ticketJobs, ticketPhotos, ticketEvents, resolutionSessions, resolutionTurns, resolutionActions }, {
  env: {
    AGENT_URL: t.option(t.string()),
    AGENT_API_KEY: t.option(t.string()),
    GRAPH_NAMESPACE: t.option(t.string()),
    S3_BUCKET: t.option(t.string()),
    S3_REGION: t.option(t.string()),
    S3_ACCESS_KEY_ID: t.option(t.string()),
    S3_SECRET_ACCESS_KEY: t.option(t.string()),
    S3_SESSION_TOKEN: t.option(t.string()),
    S3_PREFIX: t.option(t.string()),
    S3_PHOTO_BUCKET: t.option(t.string()),
    S3_PHOTO_REGION: t.option(t.string()),
  },
});
export default spacetimedb;
