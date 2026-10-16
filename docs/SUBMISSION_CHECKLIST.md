# Submission checklist — A Thousand Stores

Prepared on 2026-10-16 KST. **Not submitted.**

## Confirmed organizer requirements

- Submit at https://cerebralvalley.ai/e/google-deepmind-ai-hackathon using the original hackathon application account.
- **Hard deadline: 15:20 KST on 2026-10-16.** The earlier 15:05 target was an internal buffer.
- **Deploy on Google Cloud.**
- **Use English for submission materials.**

Source: the organizer notice pasted by the participant. The public event page also confirms individual participation and the 11:20–15:20 build window. Authenticated form fields, track options, upload limits and a receipt ID are not visible in the public page and remain unverified. Five sentences, a three-minute video target, YouTube unlisted/Drive fallback and public GitHub were preparation choices in docs/SPEC.md, not additional rules established by the pasted notice.

## Prepared items

| Item | State | File or link | Remaining action |
|---|---|---|---|
| English project description | READY — five sentences | SUBMISSION_DESCRIPTION_EN.md | Paste into the corresponding official field |
| Copy-ready field sheet | READY | SUBMISSION_FORM_FIELDS.md | Match authenticated field names; enter registered participant and track only if requested |
| Google Cloud deployment | VERIFIED — 13 checks passed | https://thousand-stores-wva46uzo7a-du.a.run.app/rehearsal/ | Supply this HTTPS URL in the form |
| Reviewed source | READY — public branch and open PR; main not merged | https://github.com/devstar2637-hash/GDH/tree/codex/fast-track | Use the intended branch/revision, not an assumed main version |
| English README | READY | README.md and SUBMISSION_README_EN.md | Use the branch-specific setup and actual limits |
| English demo MP4 | READY — 2:27, 4.69 MB | a-thousand-stores-local-demo-en.mp4 in the packet and private ChatGPT Library | Attach it or upload with reviewer access if the authenticated form requires video |
| Presenter scripts and six judges' answers | READY | DEMO_SCRIPT_EN.md and JUDGES_QA.md | Use actual current values when presenting |
| Actual recording narration | READY | RECORDED_NARRATION_EN.txt | Matches the completed captured-screen montage |
| Verification summary | READY | VERIFICATION_SUMMARY_EN.md | Retain limitations; do not replace unverified gates with a pass |
| Submission archive | PREPARED AS A VERSIONED BUNDLE | GDH-submission-20261016.zip in ChatGPT Library | Check file inventory/hash in its manifest |
| Authenticated final form and receipt | NOT SUBMITTED | Official portal | Participant reviews, sends before 15:20 KST and saves the real confirmation |

## Exact deployment and evidence

- Project: `h2gdm-hack26icn-2637`; region: `asia-northeast3`; service: `thousand-stores`.
- Cloud Run revision: `thousand-stores-00001-hzn`; traffic: 100%.
- Deployed source: `552b5dcde7d01c519029173559664d92a7b6a535`.
- Verified app code: `62e5cd78b98c953d8d0339b876bb12ad96a37c50`; subsequent changes before deployment were documentation and the portable deployment script.
- Build/type checks and active unit/HTTP suite: 126 passed, 0 failed, 0 skipped.
- Actual local Chrome: 20 checks passed, including original downloads and freshness guards.
- Actual Google Cloud: 13 checks passed, including unauthenticated access, correct source revision, one default preview request returning DONE with 10,000 unique IDs, leader ledger, input/output identity and 390px layout.
- The single Cloud request's resource duration was 4,189.3 ms after initial GET checks; headers arrived in 2,329.7 ms and body receipt/browser JSON parsing took 4,515.6 ms. Engine-only time was 264.78 ms. These are individual observations, not cold-start, percentile or two-second Cloud performance claims.
- Recording: actual local captured-screen montage, English installed-system-voice narration and captions, 147.113 seconds. It is not continuous live interaction or evidence of live model/Cloud execution. It is privately saved; no public video hosting was performed.

## Required honesty at submission

Live model calls: **0**. The deployed service has no Gemini key configured. The requested default model `gemini-4-argon` remains unverified for actual provider availability; `gemini-3.8-flash` is a planning reference, not an executed model. Local 500-seed expansion is not 500 AI-generated families.

Financial calibration, independent cashflow holdout, full independent ledger coverage and AI-versus-random advantage remain incomplete. Uncalibrated distributions stay hidden. The runtime P&L consistency check shares production arithmetic. Seven fixed external arithmetic cases do not establish a full random independent oracle. A bounded endpoint reversal is not a globally minimal or exact boundary. A demo Hold is not financial advice or the participant's real lease decision.

Data source notices are preserved in LICENSE_NOTICE.txt and data/seoul/README.md. No application code license has been chosen; do not invent a license grant. The current-text API-key-pattern scan passed without claiming full-history certification. Protected shared types, verifier tests/fixtures and raw datasets are unchanged.

## Final participant review

1. Log in to the official portal with the original application account and inspect required fields.
2. Paste the English description, intended GitHub branch/revision and verified Google Cloud URL.
3. Attach or host the prepared English video if required, then verify reviewer access.
4. Check all links and the exact version; main remains unmerged by the participant's decision.
5. Send the final form before **15:20 KST**, then save the actual receipt and submitted values.
