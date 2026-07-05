export interface AskChart {
  type: "line" | "bar" | "area";
  x: string;
  series: string[];
  title: string;
  stacked: boolean;
}

export interface AskResponse {
  answer: string;
  highlights: string[];
  sql: string;
  intent: string;
  columns: string[];
  rows: (string | number | null)[][];
  chart: AskChart | null;
  elapsedMs: number;
}

export async function askBallast(question: string, signal?: AbortSignal): Promise<AskResponse> {
  const res = await fetch("/api/ask", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (!res.ok) {
    let detail = `Query service error (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep default detail */
    }
    throw new Error(detail);
  }
  return (await res.json()) as AskResponse;
}

export interface AskStreamHandlers {
  /** Stage changes while the turn is in flight ("writing_sql", "running_sql"). */
  onStage?: (stage: string) => void;
  /** The generated SQL, before rows come back. */
  onSql?: (sql: string, intent: string) => void;
  /** Result set and chart spec; the artifact can render before the prose finishes. */
  onRows?: (data: { columns: string[]; rows: (string | number | null)[][]; chart: AskChart | null }) => void;
  /** A prose token delta. */
  onToken?: (text: string) => void;
}

/**
 * Streaming ask over SSE. Resolves with the complete response once the turn
 * finishes. Falls back to the blocking endpoint if the server does not expose
 * the stream route (older build) so chat keeps working either way.
 */
export async function askBallastStream(
  question: string,
  handlers: AskStreamHandlers,
  signal?: AbortSignal
): Promise<AskResponse> {
  const res = await fetch("/api/ask/stream", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ question }),
    signal,
  });
  if (res.status === 404 || res.status === 405) {
    return askBallast(question, signal);
  }
  if (!res.ok || !res.body) {
    let detail = `Query service error (${res.status})`;
    try {
      const body = await res.json();
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      /* keep default detail */
    }
    throw new Error(detail);
  }

  const result: AskResponse = {
    answer: "",
    highlights: [],
    sql: "",
    intent: "",
    columns: [],
    rows: [],
    chart: null,
    elapsedMs: 0,
  };
  let done = false;
  let streamError: string | null = null;

  const handleFrame = (frame: string) => {
    let event = "message";
    const dataLines: string[] = [];
    for (const line of frame.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
    }
    if (dataLines.length === 0) return;
    let payload: Record<string, unknown>;
    try {
      payload = JSON.parse(dataLines.join("\n"));
    } catch {
      return;
    }
    switch (event) {
      case "stage":
        handlers.onStage?.(String(payload.stage ?? ""));
        break;
      case "sql":
        result.sql = String(payload.sql ?? "");
        result.intent = String(payload.intent ?? "");
        handlers.onStage?.("running_sql");
        handlers.onSql?.(result.sql, result.intent);
        break;
      case "rows": {
        result.columns = (payload.columns as string[]) ?? [];
        result.rows = (payload.rows as (string | number | null)[][]) ?? [];
        result.chart = (payload.chart as AskChart | null) ?? null;
        result.elapsedMs = Number(payload.elapsedMs ?? 0);
        handlers.onRows?.({ columns: result.columns, rows: result.rows, chart: result.chart });
        break;
      }
      case "token": {
        const text = String(payload.t ?? "");
        result.answer += text;
        handlers.onToken?.(text);
        break;
      }
      case "done":
        result.highlights = ((payload.highlights as string[]) ?? []).map(String);
        result.elapsedMs = Number(payload.elapsedMs ?? result.elapsedMs);
        done = true;
        break;
      case "error":
        streamError = String(payload.detail ?? "stream failed");
        break;
    }
  };

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done: eof } = await reader.read();
    if (eof) break;
    buffer += decoder.decode(value, { stream: true });
    let sep = buffer.indexOf("\n\n");
    while (sep !== -1) {
      handleFrame(buffer.slice(0, sep));
      buffer = buffer.slice(sep + 2);
      sep = buffer.indexOf("\n\n");
    }
    // The done/error frame is terminal; do not wait for connection EOF, which
    // some proxies hold open and would leave the composer locked.
    if (done || streamError) {
      void reader.cancel().catch(() => {});
      break;
    }
  }
  if (buffer.trim()) handleFrame(buffer);

  if (streamError) throw new Error(streamError);
  if (!done && !result.answer) throw new Error("The stream ended before an answer arrived");
  result.answer = result.answer.trim();
  return result;
}
