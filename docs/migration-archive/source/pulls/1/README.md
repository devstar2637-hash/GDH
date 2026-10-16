# PR #1: [Reference] Verified cafe cashflow workbench for lane integration

Original: https://github.com/devstar2637-hash/GDH/pull/1
Author: devstar2637-hash
State: open
Head: reference/verified-store-mvp (c7cbd96f6d29eb05b121435b1f94707e7037c409)
Base: main (88b3616d27962cc8c15bb5889c3c050ce5b06f67)

This branch provides an executable cafe cashflow reference and verified UI behavior for the active A1/A2/A3 lane owners. It starts from the public-data commit and is a draft integration reference; its root package/Docker files must be reconciled with the current TypeScript scaffold before merging.

The workbench preserves zero versus missing inputs, seeded scenario reproducibility, request snapshots, out-of-order response protection and a fresh human decision per run. Gemini proposals use a server-only key and fail clearly when no key is configured.

Validation: 6/6 repository tests, 10/10 independent arithmetic/HTTP/provider-mock checks, and actual desktop/mobile Chrome checks passed. Provider tests were mocks. Live Gemini calls, Cloud deployment, calibration, main acceptance gates and the full production workflow remain unverified.

Important contract differences: the reference keeps the deposit locked through month 36, while main returns it in the final month; it uses constant numeric assumption variations rather than structural design patches; its cash-positive transaction boundary is not the main rank-flip cliff. See docs/INTEGRATION_NOTES.md for the exact adapter requirements. Preserve the frozen shared contract and verifier-owned tests.


This is an archival record, not a new review or a recommendation to merge the historical branch.
