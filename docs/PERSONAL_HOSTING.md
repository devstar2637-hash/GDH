# Personal hosting and recovery

## Source snapshot

The preserved UI snapshot is rehearsal-store commit
`83f4c34659c0053ed0c3a92318bcc40bca2a5f36`, published
2026-10-16 20:25:16 KST. It is mirrored with verified portability/UI fixes from
`ff5b2f30009b384450f0351fff87719515317f04`. The previous Cloud Run deployment still served the
16:36 GDH version when preservation started. `web/client/source-version.json`
and `/api/health` identify the deployed UI source; GitHub pushes alone do not
update Cloud Run.

## Vercel

Import the personal `rarehotdog/GDH` repository with the root directory unchanged.
`vercel.json` builds the static client and one shared Node API function. No
hackathon GCP project, Gemini credentials or remote engine URL is required:
the existing deterministic engine runs inside the function with offline
design generation. A fresh simulation is not a fresh model-generation call.

- `GET /api/summary` or `/api/default`: compact, cached 10,000-row result, replay-labelled.
- `POST /api/rehearse` or `/api/run`: recompute the real 36-month engine.
- `GET /api/export/default/csv` or `/api/export/default/report.md`: small exports.
- `/api/health` and `/version.json`: runtime, UI build and source revision.

In serverless mode, JSON responses use the explicit `responseShape: summary`
format, below Vercel's 4.5 MB limit. Full detailed envelopes remain available
when running `npm start` locally or on Cloud Run. Oracle source files and the
public-data manifest/2026 CSV inputs are included for the original hash checks.
Frozen `shared/` files and acceptance fixtures are not changed.

Serverless runs are **not durable storage**: disk persistence is disabled,
the in-memory cache is bounded and can disappear on a cold start. Download
exports or run the normal server with append-only `runs/` artifacts when
durable detailed results are needed.

## AI Studio

Connect Settings > GitHub to the personal rehearsal-store repository and pull
its latest main. Set `ENGINE_BASE_URL` to the personal GDH Vercel origin if
using a different host. Remove or update any old environment override pointing
to the hackathon Cloud Run URL. The AI Studio Vite server proxies the measured-engine
requests; the 10K spatial animation/wafer economics are an assumed preview,
not 10,000 independently verified 3D physics trajectories.

The deployed personal origin is https://thousand-stores-personal.vercel.app.
It runs the same measured 36-month engine without calling the old Cloud Run URL.
The Vercel project is connected to `rarehotdog/GDH` main for subsequent builds.

## Recovery

Full Git bundles and the old live default result were preserved outside `/tmp`
under `Desktop/Develop/thousand-stores-preserved-20261016`. Public input data is
tracked in GDH. Do not transfer `.env`, CLI auth, Google credentials or Secret
Manager keys into a repository or backup package.

References: [Node functions](https://vercel.com/docs/functions/runtimes/node-js),
[function limits](https://vercel.com/docs/functions/limitations),
[project configuration](https://vercel.com/docs/project-configuration/vercel-json).
