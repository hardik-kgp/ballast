# NTPC Plant Intelligence Console

Single-page plant intelligence console over the Ballast data layer: a chat assistant that answers with chart artifacts, a live fleet dashboard, a predictive maintenance board with SOP documents, and a predictive alerts queue. All series, KPIs and alerts come from `ballast.db` through a generated feed (`src/data/feed.json`). The chat is live: questions go to the query service (`../server`, proxied at `/api`), which writes grounded SQL over `ballast.db` and returns an answer plus a chart/table artifact. Every artifact opens into a details side panel with switchable chart types, value labels, per-series statistics, the full result table, and PNG/CSV export.

## Data feed

Generate the database, then export the UI feed:

```bash
cd ..
pip install -r requirements.txt
python data/generate.py
python -X utf8 app/scripts/export_feed.py
```

`export_feed.py` captures the schema of the data layer into typed UI shapes (see `src/data/feed.ts`): fleet/unit state from `v_unit_latest_state` + `v_equipment_health_now`, schedule vs actual from `schedule_blocks`, the golden BFP-2A vibration trend from `condition_monitoring`, IEX prices from `market_prices`, commercial exposure from `commercial_exposure` / `v_exposure_90d`, the active predictions and alert stream, and a per-asset maintenance section (health, RUL, work orders, critical spares, standby status, SOP reference) for all monitored equipment. It also copies the grounded O&M manuals and SOP PDFs from `../data/manuals/` into `public/manuals/` so the UI can open them.

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

- `src/views/` the four views: `ChatView`, `DashboardView`, `MaintenanceView`, `AlertsView`
- `src/components/Sidebar.tsx` collapsible left navigation shell
- `src/components/ArtifactPanel.tsx` details side panel: chart type switcher, value labels, series stats, full table, PNG/CSV export, executed SQL
- `src/components/charts/` recharts components shared by chat artifacts and the dashboard; the feed-backed time charts tick live via `src/hooks/useLiveSeries.ts`
- `src/lib/downloadChart.ts` SVG-to-PNG export; `src/lib/artifact.ts` panel data model, stats, and CSV export
- `src/lib/askApi.ts` client for the query service; `src/components/charts/DynamicChart.tsx` renders its chart specs
- `src/data/feed.json` generated feed (rebuild via `scripts/export_feed.py`)
- `src/data/` typed feed accessors, alert mapping, and the seeded chat turns grounded in the feed
- `public/manuals/` SOP and O&M manual PDFs copied from the data layer, linked from the maintenance view
