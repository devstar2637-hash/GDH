# Submission readiness checklist — A Thousand Stores

2026-10-16 KST · Preparation snapshot · Not a record of submission, publication or upload

## Confirmed organizer requirements and source boundaries

- **Submission portal:** https://cerebralvalley.ai/e/google-deepmind-ai-hackathon . Sign in using the account used to apply for this event.
- **Hard deadline:** **15:20 KST on 2026-10-16**. The older 15:05 target is our internal buffer, not the official deadline.
- **Mandatory deployment:** Deploy the project on **Google Cloud**.
- **Language:** **All submission materials must be in English.**
- Source for these four requirements: **Organizer notice pasted by user, 2026-10-16**. This checklist preserves the notice's requirements without inventing additional form fields.
- The [public event page](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon), read on 2026-10-16, independently lists the event in GMT+9, individual participation, the 11:20–15:20 build window and judging from 15:20. Its general Korean/English event-language label does not replace the later notice requiring English submission materials.
- The public page did **not** expose the authenticated submission form or its field labels. Required fields, upload limits and a submission confirmation ID remain unverified until the applicant signs in.
- **Internal preparation choices, not requirements established by this notice:** five-sentence description, a public repository, a video of no more than three minutes, YouTube unlisted with Drive fallback, a separate code LICENSE, track assignment and a three-location backup. Keep these as preparation targets unless the authenticated form or organizer confirms them. The notice does not specify video duration, hosting, resolution, file type, size or track rules. Sources: `docs/SPEC.md:163–175`; `docs/FINAL_REPORT_KO.md:94–106`.
- Handoff snapshot: PR #2 open, main unmerged; verified application revision `62e5cd78b98c953d8d0339b876bb12ad96a37c50`. Build and 126 active unit/HTTP checks pass; actual Chrome passes 20 checks. Cloud CLI login is confirmed, and the participant approved event project `h2gdm-hack26icn-2637`; no deployed URL is available yet. Live model calls: **0**. Deployment evidence is a separate pending gate.
- Repository address was observed through local `git remote -v`. Public access, PR content and main merging are separate checks. The user's PR-only boundary remains in force. Sources: `README.md`; `docs/TEN_K_UPDATE.md:22–28`.

## Item checklist

### 1. Portal, deadline and authenticated form

- **What:** Submit through the official portal using the original application account; identify actual required fields, final track and permitted tools.
- **Current status:** Portal, account rule and 15:20 KST hard deadline confirmed by the user-pasted organizer notice. Login-only form fields and final track are unverified; the older specification leaves Track 4 vs 3 and external-model verification scope open.
- **File / address:** [Official portal](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon); `docs/SUBMISSION_FORM_FIELDS.md`. Sources: organizer notice pasted by user, 2026-10-16; public event page agenda; `docs/SPEC.md:169–175`.
- **Next action:** Sign in with the application account, copy the actual field labels and confirm required uploads before 15:20 KST.

### 2. English project description

- **What:** English explanation of the problem, user, difference, actual implementation and limitations; actual model IDs, run time and input provenance.
- **Current status:** English description and field sheet are prepared; final portal fields remain unverified. All submission materials must be English. Five sentences are an internal format, not a length rule established by the notice. With zero live calls, successful AI-family generation and actual token usage cannot be claimed.
- **File / address:** `docs/SUBMISSION_DESCRIPTION_EN.md`. Sources: organizer notice pasted by user, 2026-10-16; `docs/SPEC.md:165`; `docs/FINAL_REPORT_KO.md:96`; `README.md`.
- **Next action:** Match every sentence to the final submitted revision and its observed evidence; retain unexecuted, uncalibrated and undeployed labels where applicable.

### 3. GitHub source and exact revision

- **What:** Runnable final source with an identifiable revision and a reviewer-accessible repository or branch.
- **Current status:** Remote address observed. PR #2 open and main unmerged per handoff. A3 application code is verified at `62e5cd7`; the final packet/deployment revision will be recorded separately. Anonymous public access to the existing branch and PR returned HTTP 200. Public GitHub is an internal preparation requirement; this organizer notice does not establish a public-repository rule.
- **File / address:** [Repository](https://github.com/devstar2637-hash/GDH), [PR #2](https://github.com/devstar2637-hash/GDH/pull/2); `engine/`, `loop/`, `data/`, `web/`, `shared/`, `tests/`, `infra/`, `docs/`, `AGENTS.md`. Sources: `docs/FINAL_REPORT_KO.md:97`; `README.md`; `docs/TEN_K_UPDATE.md:28`.
- **Next action:** Preserve PR-only authorization, record the final SHA and exact reviewer link, and verify access and a clean checkout without silently merging main.

### 4. English README and run instructions

- **What:** English installation, execution, tests, limitations, roadmap, data attribution and synthetic/replay labels.
- **Current status:** Existing README documents execution and limitations; submission-specific English draft is being prepared. The current runnable instructions are `npm ci --ignore-scripts` → `npm run build` → `npm start`; reconcile older planned `npm run dev` instructions with the final source.
- **File / address:** `README.md`, `docs/SUBMISSION_README_EN.md`. Sources: organizer notice pasted by user, 2026-10-16; `docs/SPEC.md:166`; `README.md`.
- **Next action:** Confirm the commands, active UI, environment variables and remaining live-model/deployment limitations in the exact version supplied to judges.

### 5. Google AI execution evidence

- **What:** Actual model requests and responses, model ID, usage, run ID and terminal state for the planned Argon roles.
- **Current status:** **Zero live model calls.** Mock provider I/O and local presets do not establish real Google AI execution. `gemini-4-argon` is a requested default ID; availability in the event account is unverified. The exact mandatory model rule is not specified in the organizer notice supplied for this update.
- **File / address:** Actual `runs/<run-id>/` evidence when created; server `GEMINI_MODEL` and `GEMINI_API_KEY` / Secret Manager configuration. Sources: `docs/SPEC.md:62–65,165`; `README.md`; `AGENTS.md:32,37–39`.
- **Next action:** Preserve evidence from an authorized real request, or keep the unexecuted status explicit in the English description and video.

### 6. Mandatory Google Cloud deployment and demo URL

- **What:** A project deployed on Google Cloud, with a reviewer-accessible input → calculation → result path. Cloud Run is our chosen implementation.
- **Current status:** **Mandatory requirement not yet evidenced.** Cloud CLI login confirmed by root handoff; no deployment URL or external end-to-end check yet. A local build, ZIP or recording does not satisfy deployment. A no-model preview must not be represented as a successful live-AI run.
- **File / address:** Root `Dockerfile`, `infra/deploy.sh`, `npm run deploy`; final HTTPS URL not available. Sources: organizer notice pasted by user, 2026-10-16; `docs/SPEC.md:50–53,61–62`; `docs/FINAL_REPORT_KO.md:90,99`; `README.md`.
- **Next action:** Deploy to the approved Google Cloud project, then verify actual input, result and status from the reviewer access path and record the URL and deployed revision before 15:20 KST.

### 7. English demo video and pitch

- **What:** English submission video, pitch and Q&A. Our preparation target is a recording no longer than three minutes, hosted as YouTube unlisted with Drive fallback.
- **Current status:** English recording scripts and six judges' answers are prepared; a narrated recording is in preparation. No video file, uploaded URL or playback verification observed here. **English is confirmed; the three-minute cap and hosting choices are internal targets.** Official duration, format, resolution and size limits are not specified in the pasted notice or visible public page.
- **File / address:** `docs/DEMO_SCRIPT_EN.md`, `docs/JUDGES_QA.md`; final video URL not available. Sources: organizer notice pasted by user, 2026-10-16; `docs/SPEC.md:153–167`; `docs/FINAL_REPORT_KO.md:73–74,98`; `README.md`.
- **Next action:** Reconcile the script with actual evidence, record in English and verify length, audio, content and reviewer permissions; follow any additional authenticated-form requirements.

The original SPEC demo's `1.x s`, survivor count, calibration/holdout pass, Sheets export, AI-family generation and adversarial rounds are planned placeholders. Do not narrate them as completed without evidence. Distinguish local presets from actual AI proposals, local engine timing from full-path/Cloud timing, and CSV/JSON export from Workspace storage. Sources: `docs/SPEC.md:153–161`; `README.md`; `docs/TEN_K_UPDATE.md:24–26`.

### 8. Verification evidence and limitations

- **What:** Actual checks for the submission SHA, with commands, environment, time, user path, failures and unverified gates.
- **Current status:** A3 application revision `62e5cd7` passed 126 active unit/HTTP and 20 actual Chrome checks. Those checks do not establish business acceptance. Independent cashflow calibration, hidden holdout, AI-versus-baseline evidence, live model execution and the Cloud whole path remain unsupported or incomplete.
- **File / address:** `docs/TEN_K_UPDATE.md`, protected `tests/`, actual command logs and `runs/<run-id>/`; final evidence receipt path to be set by root. Sources: `README.md`; `docs/TEN_K_UPDATE.md:22–26`; `AGENTS.md:12,30,38–39`.
- **Next action:** Attach only results matching the final SHA, retaining PASS / FAIL / BLOCKED and unverified statuses in English.

### 9. Public data, licenses and secrets

- **What:** Data sources, versions, hashes and reuse conditions; source-code licensing decision; exclusion of secrets, accounts and private/company data.
- **Current status:** Data `LICENSE_NOTICE.txt`, manifest and provenance README exist. The data notice does not license all source code; a separate code `LICENSE` was not observed in the file list. The final source scan is still to be recorded; earlier current-text API-key-pattern scans passed without claiming full-history certification. A separate code license is a preparation target, not a requirement established by this organizer notice.
- **File / address:** `LICENSE_NOTICE.txt`, `data/seoul/README.md`, `data/seoul/manifest.json`, `AGENTS.md`, `docs/SPEC.md`. Sources: `docs/SPEC.md:167`; `docs/FINAL_REPORT_KO.md:97`; `AGENTS.md:32–35`; `LICENSE_NOTICE.txt:3–20`.
- **Next action:** Confirm the code-license decision and check final files for source notices, data hashes and secret exclusion without fabricating a license grant.

### 10. Versioned package and backups

- **What:** Versioned code, English description, demo script and verification package, with the planned GitHub / second-device / Drive backups.
- **Current status:** Root agent preparing the ZIP; archive contents, hash and external backups not verified here. ZIP upload is not established as an official required submission item. Historical source documents are preparation references, not substitutes for English submission materials.
- **File / address:** Workspace `deliverables/GDH-submission-20261016.zip` planned path; final SHA, file inventory and SHA-256; backup links not set. Source: `docs/FINAL_REPORT_KO.md:75,99`.
- **Next action:** Check exact contents, English submission files, version and hash; record package readiness and external-upload completion as separate events.

### 11. Submission and receipt

- **What:** Enter the final English materials and verified links in the authenticated form, submit before the hard deadline and retain the actual receipt.
- **Current status:** **Not submitted.** Official portal known; authenticated fields, completion ID and receipt capture unavailable. Preparing documents or a ZIP is not evidence of acceptance.
- **File / address:** [Official portal](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon), `docs/SUBMISSION_FORM_FIELDS.md`; receipt ID and screenshot to be issued on actual completion. Sources: organizer notice pasted by user, 2026-10-16; `docs/FINAL_REPORT_KO.md:74–75,94–106`.
- **Next action:** Submit the reviewed final version through the application account before **15:20 KST**, then save the actual receipt, timestamp and exact submitted URLs/revision.

## Final comparison before submission

- Official portal, original application account and **15:20 KST on 2026-10-16** are used.
- All materials entered or supplied as submission materials are **English**.
- Mandatory **Google Cloud deployment** has an observed revision, reachable URL and usable result path.
- Authenticated required fields are checked directly; no field or upload rule is guessed from the public event page.
- Source, README and video describe the same final version; main and the PR are not confused.
- Repository, demo and video links open with the judges' intended permissions and display actual content.
- Unexecuted models, calibration, holdout, Cloud and Workspace storage are not described as completed.
- Secrets and account information are excluded; source attribution and data reuse terms are preserved.
- A successful submission is recorded only after observing the actual acceptance response.

This checklist update did not commit, push, publish, upload a video, deploy, submit or send external messages.
