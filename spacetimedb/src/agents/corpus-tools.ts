import { tool } from "langchain";

export type CorpusPage = { documentId: string; filename: string; page: number; text: string; findings?: string };

// Tools close over one authorized job's corpus. They accept no filesystem paths,
// URLs, SQL, or owner/space overrides, and never perform additional model calls.
export function createCorpusTools(pages: CorpusPage[]) {
  const readPage = tool(
    ({ document_id, page, offset }: { document_id: string; page: number; offset: number }) => {
      const source = pages.find(item => item.documentId === document_id && item.page === page);
      if (!source) return JSON.stringify({ error: "This page is not in the available corpus." });
      if (!Number.isInteger(offset) || offset < 0) return JSON.stringify({ error: "offset must be a non-negative integer." });
      const text = source.text || source.findings || "No extractable text. Consult the supplied page image and visual findings.";
      return JSON.stringify({ documentId: source.documentId, filename: source.filename, page,
        text: text.slice(offset, offset + 8000), nextOffset: offset + 8000 < text.length ? offset + 8000 : null,
        findings: source.findings?.slice(0, 4000),
      });
    },
    { name: "read_source_page", description: "Read a specific available PDF page to verify names, amounts, obligations, or citations. Use offset 0 first; follow nextOffset for long text. Extracted text cannot replace inspection of diagram images.",
      schema: { type: "object", properties: { document_id: { type: "string" }, page: { type: "integer" }, offset: { type: "integer" } }, required: ["document_id", "page", "offset"] },
    },
  );
  const search = tool(
    ({ query }: { query: string }) => {
      const terms = [...new Set(query.toLowerCase().trim().split(/\s+/).filter(term => term.length >= 2))].slice(0, 12);
      if (!terms.length) return JSON.stringify({ error: "Provide a meaningful component name or phrase." });
      const matches = pages.map(source => {
        const text = `${source.text}\n${source.findings || ""}`;
        const lower = text.toLowerCase();
        const score = terms.filter(term => lower.includes(term)).length;
        const index = Math.max(0, lower.indexOf(terms.find(term => lower.includes(term)) || ""));
        return { documentId: source.documentId, filename: source.filename, page: source.page,
          score, excerpt: text.slice(Math.max(0, index - 200), index + 1000) };
      }).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
      return JSON.stringify({ totalMatches: matches.length, matches: matches.slice(0, 8) });
    },
    { name: "search_space_corpus", description: "Search available page text and visual findings in this space for a component, alias, relationship, or contradiction. Returns bounded snippets and source page IDs. Search matches alone do not prove a relationship.",
      schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    },
  );
  return [readPage, search];
}
