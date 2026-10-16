# Project description

Project title: A Thousand Stores

Tagline: Rehearse the cashflow before signing the lease.

## Five-sentence submission text

Before signing a lease, cafe founders need to understand how rent, staffing, demand and opening costs affect their cash. A Thousand Stores lets them rehearse a Seongsu cafe scenario with a deterministic 36-month cashflow engine. The default run compares 10,000 seeded candidates, verifies proposed ranking-reversal intervals against the full valid candidate population, and suggests a field measurement for the founder to check. Our Google Cloud-hosted prototype includes input validation, source labels, run evidence, human decisions, CSV/JSON exports and a server-side Gemini proposal adapter whose live execution has not yet been verified. Financial calibration and superiority over random search remain unverified, so the interface labels results as assumptions, hides distributions and supports human review.

## Technical disclosure

- Default local candidates: 500 preset seed families × 20 seeded variations; these are not 500 model-generated families.
- Model adapter: requests the configured server-side Gemini model, validates structural patches, then calculates financial results in deterministic code. Live calls during this preparation: 0. Requested default model ID: `gemini-4-argon`; actual live model ID and account availability: unverified. `gemini-3.8-flash` is a planning reference, not an executed model in this demo.
- Inputs: explicit user assumptions and seeded variations. Public Seoul commercial-area summaries are shown separately as context; they do not validate an individual store's cashflow. No on-site measurement is claimed.
- Financial scope: 36 months, constrained starting budget, locked deposit and operating cash; taxes, borrowing and depreciation are outside this prototype.
- Status: local implementation verified on the evidence revision stated in the checklist; Google Cloud preview is deployed and a real 10,000-candidate request passed at https://thousand-stores-wva46uzo7a-du.a.run.app/rehearsal/; source `552b5dcde7d01c519029173559664d92a7b6a535`. Live model calls remain zero.
- This prototype is a scenario rehearsal tool, not financial advice.

## Organizer requirements supplied by the participant

- Portal: https://cerebralvalley.ai/e/google-deepmind-ai-hackathon
- Sign in with the hackathon registration account.
- Final deadline: 2026-10-16 15:20 KST.
- Deployment on Google Cloud is mandatory.
- Submission materials must be in English.
- The five-sentence format and a video of at most three minutes are internal preparation targets from docs/SPEC.md; the pasted organizer notice does not specify those limits.
