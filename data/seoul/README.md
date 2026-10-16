# Seoul commercial-area data for the hackathon

Coverage: **2021Q1-2026Q2 (22 quarters)** for stores and estimated sales.

- `data/seoul/raw/`: 10 unchanged official ZIPs (two datasets × 2021-2025).
- `data/seoul/2026/`: two UTF-8/BOM CSVs containing 2026Q1-Q2 only.
- `data/seoul/metadata/`: original/header-to-API field dictionaries.
- `manifest.json`: relative paths, sizes and SHA-256 hashes. The 2026 row
  counts and duplicate keys were checked again when this package was made.
- [LICENSE_NOTICE.txt](../../LICENSE_NOTICE.txt): required source attribution and reuse notice.

Use the annual ZIPs plus the 2026-only CSVs. Do not also load the current
2025Q1-2026Q2 exports: doing so would duplicate 2025. Those overlapping
exports, download forms, HTML snapshots and local logs are excluded.

## Interpretation boundaries

- Sales are **estimated**, in KRW; they are not audited store revenues.
- Missing sales rows are unknown/unavailable, not automatically zero sales.
- Area-level closure rates are not individual-store survival probabilities.
- The source warns about its transition to standard spatial units from 2024;
  do not assume spatial keys and area definitions are temporally identical.
- These files are historical revisions currently distributed by the source.
  They do not establish a leakage-free historical as-of backtest.
- No forecasting model, calibration test, application deployment, GitHub
  upload, or public-repository connection was run in preparing this package.

## Sources

Publisher: Seoul Metropolitan Government; provider: Seoul Credit Guarantee
Foundation. KOGL Type 1 (attribution). See [LICENSE_NOTICE.txt](../../LICENSE_NOTICE.txt).

- https://data.seoul.go.kr/dataList/OA-15577/S/1/datasetView.do
- https://data.seoul.go.kr/dataList/OA-15572/S/1/datasetView.do

## Upload

Copy **this package's listed files only** into the chosen hackathon project.
Keep the source notices. Never upload the surrounding personal workspace.
Antigravity remains the application implementation and execution environment.
