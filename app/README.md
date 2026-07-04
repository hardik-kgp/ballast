# NTPC Plant Intelligence Console

Single-page plant intelligence console over the Ballast data layer: a chat assistant that answers with chart artifacts, a live fleet dashboard, and a predictive alerts queue. All series, KPIs and alerts come from `ballast.db` through a generated feed (`src/data/feed.json`). The chat is live: questions go to the query service (`../server`, proxied at `/api`), which writes grounded SQL over `ballast.db` and returns an answer plus a chart/table artifact.

## Data feed

Generate the database, then export the UI feed:

```bash
cd ..
pip install -r requirements.txt
python data/generate.py
python -X utf8 app/scripts/export_feed.py
```

`export_feed.py` captures the schema of the data layer into typed UI shapes (see `src/data/feed.ts`): fleet/unit state from `v_unit_latest_state` + `v_equipment_health_now`, schedule vs actual from `schedule_blocks`, the golden BFP-2A vibration trend from `condition_monitoring`, IEX prices from `market_prices`, commercial exposure from `commercial_exposure` / `v_exposure_90d`, and the active predictions and alert stream.

## Run

```bash
npm install
npm run dev
```

Open http://localhost:5177. For live chat answers also start the query service:

```bash
cd ../server
pip install -r requirements.txt
python run_local.py --env-file <path-to-env-with-OPENROUTER_API_KEY> --port 8077
```

## Checks

```bash
npm run type-check
npm run lint
```

## Structure

- `src/views/` the three views: `ChatView`, `DashboardView`, `AlertsView`
- `src/components/Sidebar.tsx` collapsible left navigation shell
- `src/components/charts/` recharts components shared by chat artifacts and the dashboard
- `src/components/ui/Dialog.tsx` modal used by the artifact expand button
- `src/lib/downloadChart.ts` SVG-to-PNG export behind the artifact download button
- `src/lib/askApi.ts` client for the query service; `src/components/charts/DynamicChart.tsx` renders its chart specs
- `src/data/feed.json` generated feed (rebuild via `scripts/export_feed.py`)
- `src/data/` typed feed accessors, alert mapping, and the seeded chat turns grounded in the feed
