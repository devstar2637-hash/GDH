# AI Studio, GitHub, and Cloud Run UI Sync

The editable frontend lives in rehearsal-store's src/, index.html, and
styles.css. GDH owns the production financial engine and Cloud Run service.
The Cloud Run server serves /app.js and /styles.css; it does not serve the
AI Studio /src/main.ts entrypoint.

## Update the production UI

From a current GDH checkout, with a current rehearsal-store checkout beside it:

```sh
npm ci
npm run sync:studio-ui -- ../rehearsal-store
npm run build
npm test
npm run test:accept
npm run secrets:scan
```

Commit the generated web/client source together with the integration changes.
Deploy this checked source to the existing thousand-stores service using the
repository's Cloud Run deployment procedure. A GitHub push alone does not
deploy Cloud Run in this project; there is no configured build trigger.

The build compiles Tailwind CSS, bundles the JavaScript, and places a content
hash in the HTML asset URLs. GET /api/health reports uiBuild and the Cloud Run
revision so the served artifact can be compared with the tested build.

## AI Studio preview

After pushing changes to rehearsal-store, pull them into the existing AI
Studio workspace from Settings > GitHub. Resolve any workspace changes before
accepting the GitHub version, then restart the preview if necessary.

AI Studio's Vite server proxies /api/summary, /api/default, /api/health, and
/api/rehearse to ENGINE_BASE_URL. The default points to the deployed GDH
service. No client credentials are needed for the public rehearsal API.

## Result provenance

The spatial wafer cells and representative trajectory packets are a preview
based on assumptions. They are not 10,000 independently simulated 3D crowd
worlds. The separate 36-month engine status is computed from actual outcome
rows, with a cached replay label on default results and a fresh-run label after
an explicit run. A backend failure remains visible instead of becoming an
assumed success rate.

GET /api/summary returns compact outcome rows without monthly histories.
POST /api/rehearse?summary=1 executes the same backend as /api/run and returns
the compact representation. Full exports and /api/default remain available.

Official GitHub sync guidance:
https://ai.google.dev/gemini-api/docs/aistudio-build-mode
