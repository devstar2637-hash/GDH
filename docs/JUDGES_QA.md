# A Thousand Stores — six judge questions

Sol · v2 · 2026-10-16 KST · English answer draft

Evidence scope: source and existing local verification records. The newly connected six-screen route is awaiting the parent's final browser verification at this draft. Actual 500-family provider execution, Cloud deployment and submission are not confirmed. Use the current run and revision when answering; this document is not a certification of the planning targets.

Official submission requirements supplied by the user: all submission content must be English, Google Cloud deployment is mandatory, and 15:20 is the hard deadline. Submit through the [event portal](https://cerebralvalley.ai/e/google-deepmind-ai-hackathon) with the original application account. A three-minute video target and unlisted YouTube upload remain internal preparation choices, not confirmed official rules. No submission is performed by this document.

## 1. What does AI actually do, and why is it needed?

The implemented model path asks Gemini for structural cafe-design patches. A separate validator limits the permitted fields, rejects forbidden or invalid changes, and passes accepted designs to the deterministic engine. The model cannot change the budget, reserve requirement, oracle or reported results through these patches. The currently demonstrated local preview uses preset families and makes no model calls. The 500-family provider path has mock-I/O tests, but live execution and an advantage over matched random search are still unverified. We therefore do not claim that AI is already necessary or superior for this task.

**Show:** generation-origin label, actual token rows and the separate AI button. Never relabel a preview as AI output.

## 2. Are there really 10,000 different AI-generated stores?

The default local path calculates 10,000 candidates from 500 local preset seed families and 20 deterministic variations per family. Every candidate has a unique identifier, while the number of distinct economic assumption sets is reported separately. Those counts may differ. The live-model design targets 500 validated, unique families before expansion, using five requests of 100 proposals; fewer valid families produces an incomplete failed run without preset substitution. No live 500-family result is confirmed yet. We do not call the 10,000 variations independent model inventions.

**Show:** calculated candidate count, unique ID count, distinct assumption-set count and actual generation origin from the same run.

## 3. How do you know the financial results are correct?

The engine uses explicit arithmetic and fixed constraints, including the startup budget and minimum reserve. Tests cover invalid numeric inputs, identity, retained monthly ledgers and regression cases. Separate fixed arithmetic cases provide a narrower check; shared-formula consistency is not a full independent financial oracle. Individual-store cash-flow calibration and a genuinely hidden holdout remain unverified, and the distribution charts stay hidden. The sensitivity result establishes only a returned interval's full-population endpoint reversal, not a global minimum, an exact analytic threshold or necessarily the same two competing designs on both sides.

**Show:** current verification table, the unverified-calibration notice and the actual leader ledger. Do not present passing software tests as business validation.

## 4. Where do the data and the example numbers come from?

The repository includes public Seoul business-district data and a checked-in 22-quarter store-count summary. Its counts and rates were compared with the protected reference fixture; hashing stored files alone is not raw-CSV reconciliation. Unverified fixed estimated-sales figures were removed from the loader's returned rows. The current screen's default budget, rent, demand and physical dimensions are explicitly labelled assumptions. They are not automatically verified quotes, building-register facts or site observations. The Maps card is marked unconnected. Public aggregate business rates do not validate this specific store's future cash flow.

**Show:** source note, reference period, assumption labels and the unconnected Maps status. Do not describe the demand default as a verified OA-15572 calculation.

## 5. What happens if the model fails, times out or returns unsafe instructions?

The server-only family adapter makes at most five requests for one full batch, with concurrency capped at four, a 30-second limit per call, a 75-second total bound and a one-mebibyte response cap per request. It has no automatic retry, model fallback or fabricated completion. The validator rejects monetary, demand, budget, reserve and oracle modifications, invalid numbers, duplicate identifiers and duplicate complete parameter sets. Actual provider token metadata is retained; missing usage is not estimated. Partial valid families and measured usage are preserved with a failed run, and an absent server key is explicitly blocked. Provider failures use generic errors rather than exposing credentials or raw error bodies.

**Show:** a genuine failed or blocked run, its reason, partial-family count and measured token rows. An empty token list after an interrupted provider response is missing usage evidence, not proof of zero cost. These safeguards have mock tests; live failure behaviour is still unverified.

## 6. Is it deployed, and what can an owner safely do with it today?

The verified application path is local; a working Cloud deployment URL is not established. Google Cloud sign-in succeeded, but access to the approved project was denied. Mandatory Cloud deployment is therefore an unmet submission gate; signing in does not establish project access or deployment. The new six-screen route still needs its final browser receipt before we claim that route passed. An owner can use the implemented flow to explore explicit assumptions, inspect a bounded sensitivity result and record their own fresh choice. Exports are local CSV, Markdown or JSON downloads, not automatic Google Docs or Sheets uploads. The tool does not make a lease or loan decision, perform an external transaction or produce real-world survival probabilities. Live model cost, calibration, AI-versus-random evidence and durable Cloud storage are remaining gates.

**Show:** the actual runtime address and recorded revision. A GitHub source link is not a deployed demo URL. State clearly that the mandatory Cloud deployment gate is unmet until a working Cloud URL and runtime evidence exist.

## Short answer discipline

- Lead with what actually ran, then state what remains unverified.
- Attribute a number to the current run, its input snapshot and revision. Do not reuse an older run's timing or candidate statistics after changing inputs.
- A recorded demo is a recording, and a mock provider response is a mock. Neither establishes a successful live model call.
- A test pass, recorded artifact and Cloud deployment are different pieces of evidence. State each only when its own evidence exists.

Sources: official event instructions pasted by the user for submission requirements; `docs/SPEC.md` §§10–11 for internal preparation plans; `docs/TEN_K_UPDATE.md`, `web/server.ts`, `web/client/app.ts`, `data/seoulLoader.ts`, `loop/familyBatches.ts`, `loop/boundedProposals.ts` and engine source. The original planning report describes targets and is not proof that those targets were reached.
