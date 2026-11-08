import { useTable } from "spacetimedb/react";
import { tables } from "@/module_bindings";

/** Live list of a ticket's verified photos (from the glasses or phone), oldest first. */
export function useTicketPhotos(ticketId: string | null) {
  const [rows] = useTable(tables.myTicketPhotos, { enabled: !!ticketId });
  if (!ticketId) return [];
  return rows
    .filter(row => row.ticketId.toString() === ticketId && row.status === "verified")
    .sort((a, b) => (a.createdAt.microsSinceUnixEpoch < b.createdAt.microsSinceUnixEpoch ? -1 : 1));
}
