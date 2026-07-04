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

`GET /healthz` reports DB presence and the configured model (`BALLAST_LLM_MODEL`, default `openai/gpt-5.4` via OpenRouter).
