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
