"""Ballast intelligence layer: natural-language queries over ballast.db.

Grounds an LLM on data/semantic_layer.json to generate a single read-only
SQL statement, executes it against a read-only SQLite connection, then
composes a concise narrative answer plus a chart suggestion for the UI.

    pip install -r requirements.txt
    set OPENROUTER_API_KEY=...   (or OPEN_ROUTER_API_KEY)
    uvicorn main:app --port 8077
"""
import json
import os
import re
import sqlite3
import time

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

HERE = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.normpath(os.path.join(HERE, "..", "data", "ballast.db"))
SEMANTIC_PATH = os.path.normpath(os.path.join(HERE, "..", "data", "semantic_layer.json"))

OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"
MODEL = os.environ.get("BALLAST_LLM_MODEL", "openai/gpt-5.4")
ROW_CAP = 400
SQL_TIMEOUT_S = 10.0

FORBIDDEN = re.compile(
    r"\b(insert|update|delete|drop|alter|create|replace|attach|detach|pragma|vacuum|reindex|analyze)\b",
    re.IGNORECASE,
)

with open(SEMANTIC_PATH, encoding="utf-8") as f:
    SEMANTIC_LAYER = json.load(f)


def load_schema_ddl() -> str:
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True)
    try:
        rows = conn.execute(
            "SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('table','view') ORDER BY type, name"
        ).fetchall()
        return ";\n\n".join(r[0] for r in rows)
    finally:
        conn.close()


SCHEMA_DDL = load_schema_ddl() if os.path.exists(DB_PATH) else ""


def api_key() -> str:
    key = os.environ.get("OPENROUTER_API_KEY") or os.environ.get("OPEN_ROUTER_API_KEY")
    if not key:
        raise HTTPException(503, "OPENROUTER_API_KEY is not configured on the server")
    return key


SQL_SYSTEM_PROMPT = f"""You are Ballast, the commercial intelligence layer for thermal power plants.
You answer operator questions by writing ONE read-only SQLite SELECT statement over the Ballast database.

The complete semantic layer (tables, grains, joins, conventions, rupee formulas, example question->SQL pairs) is:

{json.dumps(SEMANTIC_LAYER, ensure_ascii=False)}

The exact SQLite DDL (authoritative column names; use ONLY columns that appear here):

{SCHEMA_DDL}

Rules:
- Output STRICT JSON only: {{"sql": "...", "chart": {{...}} | null, "intent": "..."}}
- Exactly one SELECT (WITH ... SELECT allowed). Never modify data. Never use PRAGMA or ATTACH.
- Follow the conventions block: epoch seconds for ts, clock_now from data_meta (never wall-clock now), /1e7 for crore, prefer rollup tables and views over raw telemetry.
- Keep result sets small and chart-ready: aggregate, order, and LIMIT (<= {ROW_CAP} rows). For time series return one row per bucket with readable labels (e.g. strftime('%Y-%m-%d', datetime(ts+19800,'unixepoch'))).
- Column aliases become chart labels: use short snake_case aliases.
- "chart" describes how the UI should plot the result, or null if a table alone is better:
  {{"type": "line"|"bar"|"area", "x": "<column alias>", "series": ["<numeric column aliases>"], "title": "...", "stacked": true|false}}
- "intent" is one short sentence restating what the SQL computes.
"""

ANSWER_SYSTEM_PROMPT = """You are Ballast, a plant intelligence assistant for thermal power operators.
Given the operator's question, the SQL that was executed, and the resulting rows, write the answer.

Output STRICT JSON only: {"answer": "...", "highlights": ["...", "..."]}
- "answer": 2-4 complete sentences, plain prose, grounded ONLY in the rows. Use concrete numbers with units (MW, mm/s, %, days) and rupees in crore (Cr). No markdown, no em dashes.
- "highlights": 2-4 short bullet strings with the key numbers.
- If the rows are empty, say plainly that nothing matched and suggest what to check instead. Never invent values.
"""

HIGHLIGHTS_SENTINEL = "===HIGHLIGHTS==="

ANSWER_STREAM_SYSTEM_PROMPT = f"""You are Ballast, a plant intelligence assistant for thermal power operators.
Given the operator's question, the SQL that was executed, and the resulting rows, write the answer.

First write the answer: 2-4 complete sentences of plain prose, grounded ONLY in the rows. Use concrete
numbers with units (MW, mm/s, %, days) and rupees in crore (Cr). No markdown, no em dashes. If the rows
are empty, say plainly that nothing matched and suggest what to check instead. Never invent values.

Then, on a new line, output exactly {HIGHLIGHTS_SENTINEL} followed by a JSON array of 2-4 short bullet
strings with the key numbers, e.g. {HIGHLIGHTS_SENTINEL}["Fleet load 4,712 MW", "Exposure 11.2 Cr"]
"""


class AskRequest(BaseModel):
    question: str


def call_llm(messages: list[dict], max_tokens: int = 1200) -> str:
    resp = httpx.post(
        OPENROUTER_URL,
        headers={"Authorization": f"Bearer {api_key()}"},
        json={
            "model": MODEL,
            "messages": messages,
            "max_tokens": max_tokens,
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=60.0,
    )
    if resp.status_code != 200:
        raise HTTPException(502, f"LLM call failed ({resp.status_code}): {resp.text[:300]}")
    return resp.json()["choices"][0]["message"]["content"]


def parse_json(text: str) -> dict:
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text)
    return json.loads(text)


def validate_sql(sql: str) -> str:
    stripped = sql.strip().rstrip(";").strip()
    if ";" in stripped:
        raise ValueError("multiple statements are not allowed")
    head = stripped.lstrip("(").lstrip().lower()
    if not (head.startswith("select") or head.startswith("with")):
        raise ValueError("only SELECT statements are allowed")
    if FORBIDDEN.search(stripped):
        raise ValueError("statement contains a forbidden keyword")
    return stripped


def run_sql(sql: str) -> tuple[list[str], list[list]]:
    conn = sqlite3.connect(f"file:{DB_PATH}?mode=ro", uri=True, timeout=5.0)
    try:
        deadline = time.monotonic() + SQL_TIMEOUT_S
        conn.set_progress_handler(lambda: 1 if time.monotonic() > deadline else 0, 100_000)
        cur = conn.execute(sql)
        columns = [d[0] for d in cur.description or []]
        rows = cur.fetchmany(ROW_CAP)
        clean = [
            [round(v, 4) if isinstance(v, float) else v for v in row]
            for row in rows
        ]
        return columns, clean
    finally:
        conn.close()


def validate_chart(chart, columns: list[str]):
    if not isinstance(chart, dict):
        return None
    x = chart.get("x")
    series = [s for s in chart.get("series", []) if s in columns]
    if chart.get("type") not in ("line", "bar", "area") or x not in columns or not series:
        return None
    return {
        "type": chart["type"],
        "x": x,
        "series": series,
        "title": str(chart.get("title") or "Query result"),
        "stacked": bool(chart.get("stacked", False)),
    }


app = FastAPI(title="Ballast Query Service")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5177", "http://127.0.0.1:5177"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/healthz")
def healthz():
    ok = os.path.exists(DB_PATH)
    return {"status": "ok" if ok else "no-db", "db": DB_PATH, "model": MODEL}


def build_plan(question: str) -> tuple[str, dict, list[str], list[list]]:
    """Generate, validate and execute the SQL plan, with one self-repair retry."""
    messages = [
        {"role": "system", "content": SQL_SYSTEM_PROMPT},
        {"role": "user", "content": question},
    ]
    sql = ""
    columns: list[str] = []
    rows: list[list] = []
    plan: dict = {}
    last_error = None
    for attempt in range(2):
        raw = call_llm(messages)
        try:
            plan = parse_json(raw)
            sql = validate_sql(str(plan.get("sql", "")))
            columns, rows = run_sql(sql)
            last_error = None
            break
        except (ValueError, KeyError, json.JSONDecodeError, sqlite3.Error) as exc:
            last_error = str(exc)
            messages.append({"role": "assistant", "content": raw})
            messages.append(
                {
                    "role": "user",
                    "content": f"That failed with: {last_error}. Return corrected strict JSON with a valid single read-only SELECT.",
                }
            )
    if last_error is not None:
        raise HTTPException(422, f"Could not produce a valid query: {last_error}")
    return sql, plan, columns, rows


@app.post("/api/ask")
def ask(req: AskRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "question is required")
    started = time.monotonic()

    sql, plan, columns, rows = build_plan(question)

    preview = {"columns": columns, "rows": rows[:60], "total_rows": len(rows)}
    answer_raw = call_llm(
        [
            {"role": "system", "content": ANSWER_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"question": question, "sql": sql, "result": preview},
                    ensure_ascii=False,
                ),
            },
        ],
        max_tokens=700,
    )
    try:
        composed = parse_json(answer_raw)
    except json.JSONDecodeError:
        composed = {"answer": answer_raw.strip(), "highlights": []}

    return {
        "answer": str(composed.get("answer", "")).strip(),
        "highlights": [str(h) for h in composed.get("highlights", [])][:4],
        "sql": sql,
        "intent": str(plan.get("intent", "")),
        "columns": columns,
        "rows": rows,
        "chart": validate_chart(plan.get("chart"), columns),
        "elapsedMs": int((time.monotonic() - started) * 1000),
    }


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


def stream_answer(question: str, sql: str, preview: dict):
    """Yield ("token", text) deltas for the prose, then one ("highlights", list).

    The model writes the prose first and appends highlights after a sentinel,
    so we can stream tokens without having to parse partial JSON.
    """
    payload = {
        "model": MODEL,
        "messages": [
            {"role": "system", "content": ANSWER_STREAM_SYSTEM_PROMPT},
            {
                "role": "user",
                "content": json.dumps(
                    {"question": question, "sql": sql, "result": preview},
                    ensure_ascii=False,
                ),
            },
        ],
        "max_tokens": 700,
        "temperature": 0.1,
        "stream": True,
    }
    acc = ""
    emitted = 0
    found = False
    with httpx.Client(timeout=90.0) as client:
        with client.stream(
            "POST", OPENROUTER_URL, headers={"Authorization": f"Bearer {api_key()}"}, json=payload
        ) as resp:
            if resp.status_code != 200:
                body = resp.read().decode("utf-8", "ignore")[:300]
                raise HTTPException(502, f"LLM stream failed ({resp.status_code}): {body}")
            for line in resp.iter_lines():
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    break
                try:
                    delta = json.loads(data)["choices"][0].get("delta", {}).get("content") or ""
                except (json.JSONDecodeError, KeyError, IndexError):
                    continue
                if not delta:
                    continue
                acc += delta
                if found:
                    continue
                idx = acc.find(HIGHLIGHTS_SENTINEL)
                if idx != -1:
                    if idx > emitted:
                        yield "token", acc[emitted:idx]
                    emitted = idx
                    found = True
                else:
                    # Hold back a sentinel-sized tail so a split sentinel never leaks.
                    safe = max(emitted, len(acc) - len(HIGHLIGHTS_SENTINEL))
                    if safe > emitted:
                        yield "token", acc[emitted:safe]
                        emitted = safe
    if not found and len(acc) > emitted:
        yield "token", acc[emitted:]
    highlights: list[str] = []
    if found:
        tail = acc[emitted + len(HIGHLIGHTS_SENTINEL):]
        match = re.search(r"\[.*\]", tail, re.DOTALL)
        if match:
            try:
                highlights = [str(h) for h in json.loads(match.group(0))][:4]
            except json.JSONDecodeError:
                pass
    yield "highlights", highlights


@app.post("/api/ask/stream")
def ask_stream(req: AskRequest):
    question = req.question.strip()
    if not question:
        raise HTTPException(400, "question is required")

    def generate():
        started = time.monotonic()
        try:
            yield sse("stage", {"stage": "writing_sql"})
            sql, plan, columns, rows = build_plan(question)
            yield sse("sql", {"sql": sql, "intent": str(plan.get("intent", ""))})
            yield sse(
                "rows",
                {
                    "columns": columns,
                    "rows": rows,
                    "chart": validate_chart(plan.get("chart"), columns),
                    "elapsedMs": int((time.monotonic() - started) * 1000),
                },
            )
            preview = {"columns": columns, "rows": rows[:60], "total_rows": len(rows)}
            highlights: list[str] = []
            for kind, value in stream_answer(question, sql, preview):
                if kind == "token":
                    yield sse("token", {"t": value})
                else:
                    highlights = value
            yield sse(
                "done",
                {"highlights": highlights, "elapsedMs": int((time.monotonic() - started) * 1000)},
            )
        except HTTPException as exc:
            yield sse("error", {"detail": str(exc.detail)})
        except Exception as exc:  # surface anything else as an SSE error frame
            yield sse("error", {"detail": str(exc)})

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
