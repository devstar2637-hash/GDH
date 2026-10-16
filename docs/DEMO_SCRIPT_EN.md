# A Thousand Stores — recording script

Sol · v2 · 2026-10-16 KST · English recording draft

The official event instructions supplied by the user require all submission content in English, deployment on Google Cloud, and submission by the hard deadline of 15:20. Use the original application account at the [submission portal](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon). This document does not sign in, deploy or submit anything.

The 90-second and three-minute variants below are internal recording plans. A three-minute maximum and an unlisted YouTube upload are preparation choices from `docs/SPEC.md` §§10–11; they have not been established here as official event rules.

Status: recording draft. The new six-screen client has implementation evidence; its final browser verification is still pending at this draft. No video has been recorded, uploaded or submitted by this document. Use the recording revision and a fresh run's actual values. If the screen differs, describe the observed result or pause recording.

Deployment gate: Google Cloud sign-in succeeded, but access to the approved project was denied. No working Cloud deployment URL is confirmed. Sign-in alone does not satisfy the mandatory deployment requirement.

## Recording setup

- Open `/rehearsal` on the running local server. The GitHub branch and PR are source-review links, not a hosted application. A Cloud URL is not available in the verified evidence.
- Begin with no previous run or selected decision. Show the input form's `assumed` labels. The HTML defaults include a KRW 120,000,000 budget, KRW 40,000,000 deposit, KRW 48,000,000 initial investment, and KRW 3,300,000 monthly rent. These are scenario assumptions, not verified quotations or observations.
- Use the local-preview button with 10,000 candidates selected. This path uses 500 local preset seed families × 20 deterministic variations. Do not describe it as 500 model-generated families.
- For the final choice and export, wait for a fresh `DONE` result matching the current inputs. Record the downloaded file opening. If the run fails or is blocked, show its reason and leave export disabled.
- Keep the AI button separate. Its 500-family live path is implemented and mock-tested; actual provider execution, token cost and model advantage remain unverified. Do not make an unplanned paid call to create footage.

## 0:00–0:25 · Screen 1: the decision and its assumptions

**Narration**

“A first-time cafe owner has a limited budget and uncertain assumptions about demand, rent and operating capacity. A Thousand Stores helps them rehearse those assumptions before making their own decision. Here, the starting budget is 120 million won. Every input is explicitly labelled as an assumption; these values are not verified site measurements.”

**Cue:** Show the inputs together with their `assumed` tags. Do not describe them as verified quotations or building-register facts.

## 0:25–0:50 · Screen 2: a fresh local calculation

**Narration**

“I am running the local preview. It expands 500 preset seed families into 10,000 candidates and calculates their 36-month cash flows. The status identifies this run, its input hash and engine revision. Candidate count, unique identifiers and distinct assumption sets are reported separately. No model call is part of this preview.”

**Cue:** Run the local preview and show the actual run ID, candidate count, unique IDs and distinct assumption sets. Read only this run's displayed timing. If it is not `DONE`, show the failure reason.

## 0:50–1:15 · Screen 3: a bounded sensitivity result

**Narration**

“This sensitivity card asks whether the leading design changes when one assumption changes. When a reversal interval is found, the engine checks its endpoints against the full valid candidate population. We show the returned variable, reference value and leader identifiers. This supports an endpoint comparison; it does not establish a globally smallest threshold or an exact switching point.”

**Cue:** Point only to the current run's variable, value and two leader IDs. Do not click disabled endpoint-replay buttons.

**If no interval exists, replace this segment with:**

“This run did not find a verified reversal interval within its bounded search. The interface leaves the result unresolved. That does not prove that no reversal exists elsewhere.”

## 1:15–1:40 · Screen 4: the next evidence to collect

**Narration**

“The next-measurement card turns that sensitivity result into a concrete question to investigate. For example, a returned preparation-time question can guide a short observation exercise. The displayed action is a proposal for gathering evidence. No site visit or measurement has been performed by this software. If the interval is unresolved, its linked measurement remains unresolved too.”

**Cue:** Read the actual displayed proposal. If the variable is not preparation time, adapt the example sentence to that variable. Do not claim a site measurement was completed.

## 1:40–2:15 · Screen 5: verification and limits

**Narration**

“Verification stays visible. Cash-flow calibration and hidden-holdout validation are unverified, so distribution charts remain hidden. A single calculated cash-flow example can still be inspected under its stated assumptions. Stored public business-opening and closure summaries provide context, not validation of this individual cafe. The interface also separates executed checks from unrun adversarial rounds and unverified AI-versus-random performance.”

**Cue:** Show the unverified-calibration notice, hidden distributions, individual calculation curve and verification table. Do not narrate an unverified `PASS` or AI advantage.

## 2:15–2:45 · Screen 6: a fresh human choice and export

**Narration**

“The owner makes the decision. I will record ‘Hold’ for this rehearsal, then save the current run's evidence. The export includes the input snapshot, run identity and my choice. Changing an input invalidates the previous result and clears the choice before another export. These are downloaded files; they are not automatically uploaded to Google Docs or Sheets.”

**Cue:** Choose Hold only after a `DONE` run matching the current inputs. Open an actually downloaded CSV, Markdown or JSON file and check the choice and run ID. Changing an input must clear the previous choice.

## 2:45–3:00 · Close

**Narration**

“Today, the verified path is a local, assumption-based rehearsal. The bounded 500-family model adapter still needs live provider evidence. Required Cloud deployment is blocked by project access. Our goal is to make uncertainty and missing evidence visible, so a confident answer cannot silently replace a checked result.”

## Optional 90-second rehearsal cut — internal target

Use the same fresh run and the same six-screen order. The following is a shorter narration draft, not evidence that the recording or deployment is complete.

**0:00–0:15 · Inputs:** “A Thousand Stores helps a cafe owner rehearse uncertain assumptions before making a decision. The starting budget is 120 million won. These inputs are assumptions, not verified site measurements.”

**0:15–0:30 · Local preview:** “This local preview expands 500 preset seed families into 10,000 candidates. Unique identifiers and distinct economic assumption sets are reported separately. No model call is part of this run.”

**0:30–0:45 · Sensitivity:** “The sensitivity card shows a returned reversal interval, checked against the valid candidate population at its endpoints. It does not establish the globally smallest threshold.” If no interval is returned, say: “This bounded search did not find a verified reversal interval; the result remains unresolved.”

**0:45–1:00 · Measurement:** “The next-measurement card proposes evidence to collect about that uncertainty. It does not mean a field measurement has already happened.” Show only the actual proposal; if unresolved, state that it is unresolved.

**1:00–1:15 · Limits:** “Calibration is unverified, so distribution charts stay hidden. The individual curve is a calculation under assumptions. Live AI execution and model advantage are also unverified.”

**1:15–1:30 · Choice and status:** “After this fresh result, I choose Hold and download its evidence. Required Cloud deployment remains blocked by project access. The owner keeps the final decision.” Open an actual download; if the run is incomplete, show the failure and leave the choice and export disabled.

## Evidence boundaries for the final edit

- Keep the recording labelled as a recording. Do not describe replayed footage or mock provider responses as live model execution.
- Local tests and local timings are not Cloud evidence. No deployment URL or submission receipt is established here.
- 10,000 candidate IDs do not imply 10,000 distinct economic parameter sets or independent model inventions. Read all three reported counts.
- Avoid “survival probability,” verified business predictions, “AI outperforms random search,” successful hidden-holdout claims, and automatic Google export claims.
- Before recording the new six-screen route, obtain its browser receipt. Until then, the cues above are the intended recording sequence, not a report that the sequence has already passed.

Sources: official event instructions pasted by the user for submission language, deployment, deadline and portal; `docs/SPEC.md` §§10–11 for internal recording plans; `docs/FINAL_REPORT_KO.md` (planning, not implementation evidence); `docs/TEN_K_UPDATE.md`; current `web/client/index.html`, `web/client/app.ts`, `web/server.ts`, `loop/familyBatches.ts` and engine source. Final claims must follow the actual recorded revision and run evidence.
