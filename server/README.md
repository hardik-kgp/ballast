# Ballast query service

Natural-language questions over `data/ballast.db`. One FastAPI endpoint grounds an LLM on `data/semantic_layer.json` plus the live SQLite DDL, generates a single read-only SELECT, executes it with guards (read-only connection, single statement, keyword blocklist, row cap, timeout, one self-repair retry), then composes a concise answer, highlights, and a chart suggestion the app renders as an artifact.

## Run

```bash
pip install -r requirements.txt
# needs OPENROUTER_API_KEY (or OPEN_ROUTER_API_KEY) in the environment or an env file:
python run_local.py --env-file ../../.env --port 8077
```

The app's Vite dev server proxies `/api` to `localhost:8077`, so the chat view queries live once both are running.

## API

`POST /api/ask` `{"question": "..."}` returns:

```jsonc
{
  "answer": "...",          // 2-4 grounded sentences
  "highlights": ["..."],
  "sql": "SELECT ...",       // the executed statement
  "intent": "...",
  "columns": ["..."],
  "rows": [[...]],           // capped at 400
  "chart": {"type": "line|bar|area", "x": "...", "series": ["..."], "title": "...", "stacked": false} | null,
  "elapsedMs": 4200
}
```

`POST /api/ask/stream` takes the same body and returns `text/event-stream` for progressive rendering. Events, in order:

```
event: stage   data: {"stage": "writing_sql"}
event: sql     data: {"sql": "SELECT ...", "intent": "..."}
event: rows    data: {"columns": [...], "rows": [[...]], "chart": {...}|null, "elapsedMs": ...}
event: token   data: {"t": "answer text delta"}      // repeated
event: done    data: {"highlights": ["..."], "elapsedMs": ...}
event: error   data: {"detail": "..."}               // terminal, replaces done
```

The SQL-generation call stays non-streaming (a partial JSON plan cannot be validated); only the answer-composition call streams, with highlights parsed from a sentinel suffix. The app uses this endpoint and falls back to `POST /api/ask` if it is missing.

`GET /healthz` reports DB presence and the configured model (`BALLAST_LLM_MODEL`, default `openai/gpt-5.4` via OpenRouter).
