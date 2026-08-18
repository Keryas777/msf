# War Counter Vision — R5 benchmark checkpoint

Last updated: 2026-08-18

This file is the recovery point for the War Counter Vision R5 work. It is intentionally self-contained so a new conversation can resume from GitHub without relying on chat history.

## Scope and constraints

- Project: Keryas777/msf, static GitHub Pages / vanilla JS.
- War Counter Vision is separate from war debriefs. Do not modify `workers/msf-war-ocr/worker.js`.
- No Gemini.
- Groq/Qwen free-form recognition has already been judged unreliable for this task; do not call Groq again until local shortlist recall is proven.
- Mobile-first target: iOS Safari, Android Chrome, PWA, Discord browser.
- `war-counters.json` is a context/coherence signal, not a closed-world catalog. New variants must remain discoverable.

## Exact R5 benchmark fixture

Original archive name:

`war-counter-r5-benchmark-1786421094500.zip`

SHA-256:

`147138e710e63e30f23984efd4d8e6a0fddc83dcbb6a073de7c7cad674831b9a`

Size: 689,033 bytes.

Durable backup uploaded to Google Drive on 2026-08-18:

- Drive file ID: `16jkUseW5f7PBrXXTo16cZir2PjH3iNPr`
- file name: `war-counter-r5-benchmark-1786421094500.zip`

A checksum pointer is also committed at:

`benchmarks/war-counter-r5/fixtures/war-counter-r5-benchmark-1786421094500.zip.sha256`

Archive contents: 83 files total:

- `manifest.json`
- 10 slot folders × 8 variants = 80 JPEG crops
- `power/power-left.jpg`
- `power/power-right.jpg`

Variants per slot:

`base`, `tight`, `loose`, `shift-left`, `shift-right`, `shift-up`, `shift-down`, `red-neutral`.

Ground truth:

- G1 `Knull`
- G2 `Toxin`
- G3 `Venom`
- G4 `SymbioteQuicksilver`
- G5 `Riot`
- D1 `Gwenpool`
- D2 `JeffTheLandShark`
- D3 `SquirrelGirl`
- D4 `SheHulk`
- D5 `Deadpool`

Source capture from manifest: `Screenshot_20260804_182521_MARVEL_Strike_Force.jpeg`, 1796×474.

Power OCR zones are also exported. Ground-truth player powers observed on the screenshot:

- left: 12,773,206
- right: 15,901,363
- left/right ratio ≈ 0.803

Do not confuse these values with the displayed battle score `59 566 : 14 122`.

## Portrait reference catalog

The current War Counter portrait reference set contains 450 candidates, generated from official portrait URLs and published via:

`docs/data/war-counter-vision/portrait-signatures.json`

`msf-characters.json` itself is generated from the official MSF character/localization API by `scripts/fetch-characters.mjs` and refreshed automatically by GitHub Actions.

## Previous local-signature result

The handcrafted pixel/color/edge signature approach failed badly on the representative capture:

- Top1: 0/10
- Top20: 2/10
- mean rank: 195.2

Exact truth ranks were:

- Knull 237
- Toxin 264
- Venom 19
- SymbioteQuicksilver 156
- Riot 145
- Gwenpool 445
- JeffTheLandShark 432
- SquirrelGirl 178
- SheHulk 73
- Deadpool 3

Conclusion: old handcrafted signature must not be used as primary prefilter.

## MobileNet benchmark history

On exact R5 128×118 base crops against 450 official portraits:

- G1 Knull #2
- G2 Toxin #1
- G3 Venom #4
- G4 SymbioteQuicksilver #3
- G5 Riot #1
- D1 Gwenpool #113
- D2 JeffTheLandShark #44
- D3 SquirrelGirl #79
- D4 SheHulk #122
- D5 Deadpool #10

Overall Top20: 6/10.

The left side (no red X overlays) was 5/5 in Top4. The right side was strongly degraded by the red crosses.

Red-neutral experiment:

- Gwenpool 113 → 135
- Jeff 44 → 85
- Squirrel Girl 79 → 13
- She-Hulk 122 → 271
- Deadpool 10 → 1

RetCon rank-sum 12 → 17; cosine 16 → 14. Global red neutralization is therefore too destructive.

Geometric red-X masking was also worse:

- Gwenpool #164
- Jeff #110
- Squirrel Girl #138
- She-Hulk #237
- Deadpool #12
- RetCon rank-sum #30 / cosine #32

Multi-view MobileNet (full/center/top/bottom/left/right) improved team coherence but not individual recognition. Best team signal was Top-3 mean cosine:

- Gwenpool #75
- Jeff #45
- Squirrel Girl #23
- She-Hulk #220
- Deadpool #3
- RetCon: rank-sum #8, cosine #3 among 119 known defense compositions.

Conclusion: MobileNet may remain only as a secondary signal; it does not meet the individual shortlist target on red-cross portraits.

## ORB / AKAZE result — critical finding

GitHub Actions run #25:

`https://github.com/Keryas777/msf/actions/runs/32077446797/job/95533527735`

Pinned OpenCV build:

`opencv-contrib-python-headless==4.10.0.84`

Exact base-crop results against 450 official portraits:

### ORB

- Top1 9/10
- Top5 9/10
- Top10 9/10
- Top20 9/10
- mean rank 3.5
- only failure: Venom rank #26
- RetCon team rank #1

### AKAZE

- Top1 10/10
- Top5 10/10
- Top10 10/10
- Top20 10/10
- mean rank 1.0
- every G1→D5 character rank #1
- RetCon team rank #1

### ORB + AKAZE RRF

- Top1 10/10
- Top20 10/10
- mean rank 1.0
- RetCon team rank #1

This is the strongest result obtained so far. AKAZE correctly identifies all five red-X defense portraits at rank #1.

Relevant script:

`scripts/war_counter_r5_feature_benchmark.py`

Branch:

`agent/war-counter-r5-embeddings-benchmark`

## Run #26 — descriptor export

Run:

`https://github.com/Keryas777/msf/actions/runs/32078698598/job/95537167945`

Run succeeded.

It generated:

`benchmark-r5-akaze-reference-descriptors.npz`

with:

- 450 reference portraits
- 93,263 AKAZE descriptors
- output size 4,615,041 bytes
- OpenCV 4.10.0
- threshold 0.0008
- reference resize max 320 px

GitHub Actions artifact ID: `9304375584`.

The artifact also contains the MobileNet and ORB/AKAZE base reports.

Relevant exporter:

`scripts/war_counter_r5_export_akaze_refs.py`

Workflow:

`.github/workflows/war-counter-r5-embedding-benchmark.yml`

## 80-crop robustness probe — completed locally

The exact original 80 JPEG crops from the ZIP were compared against the 450 reference descriptor blocks exported by run #26.

Important reproducibility note: the reference descriptors were generated by OpenCV 4.10.0 in GitHub Actions, while the local query probe used OpenCV 4.13.0. The descriptor format is compatible, but this version mismatch measurably changes at least one base rank: run #25 with 4.10.0 gives Venom #1, while the cross-version local probe gives Venom #2 on `base`. Therefore these 80-crop numbers are a strong robustness probe, not yet the final same-version certification.

Aggregate cross-version results over all 80 crops:

- Top1: 72/80 = 90.0%
- Top5: 77/80 = 96.25%
- Top10: 80/80 = 100%
- Top20: 80/80 = 100%
- mean rank: 1.43
- worst rank: #10

By perturbation:

| Variant | Top1 | Top5 | Top10 | Top20 | Mean rank | Worst |
|---|---:|---:|---:|---:|---:|---:|
| base | 9/10 | 10/10 | 10/10 | 10/10 | 1.10 | 2 |
| tight | 8/10 | 9/10 | 10/10 | 10/10 | 1.90 | 7 |
| loose | 8/10 | 9/10 | 10/10 | 10/10 | 2.10 | 8 |
| shift-left | 9/10 | 10/10 | 10/10 | 10/10 | 1.10 | 2 |
| shift-right | 10/10 | 10/10 | 10/10 | 10/10 | 1.00 | 1 |
| shift-up | 10/10 | 10/10 | 10/10 | 10/10 | 1.00 | 1 |
| shift-down | 10/10 | 10/10 | 10/10 | 10/10 | 1.00 | 1 |
| red-neutral | 8/10 | 9/10 | 10/10 | 10/10 | 2.20 | 10 |

By character, ranks across `base / tight / loose / shift-left / shift-right / shift-up / shift-down / red-neutral`:

- Knull: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- Toxin: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- Venom: `2 / 4 / 8 / 2 / 1 / 1 / 1 / 1`
- SymbioteQuicksilver: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- Riot: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- Gwenpool: `1 / 7 / 5 / 1 / 1 / 1 / 1 / 4`
- JeffTheLandShark: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- SquirrelGirl: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- SheHulk: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 1`
- Deadpool: `1 / 1 / 1 / 1 / 1 / 1 / 1 / 10`

Interpretation:

- all 80 realistic perturbations keep the true character inside Top20;
- all 80 stay inside Top10 even with the OpenCV 4.10-reference / 4.13-query mismatch;
- 7 of 10 characters are rank #1 for all eight variants;
- translation robustness is excellent: shift-right/up/down are 30/30 Top1; shift-left is 9/10 Top1 and 10/10 Top5;
- the remaining weaknesses are mainly tighter/wider framing for Venom/Gwenpool and the artificial `red-neutral` transform for Deadpool;
- because production should normally use the original crop rather than destructive red-neutral preprocessing, Deadpool's red-neutral #10 is not a reason to reject AKAZE.

## Current decision and next step

AKAZE has passed the original shortlist criterion very comfortably in the robustness probe: 80/80 Top20 and 80/80 Top10.

Before production integration, run one final same-version 4.10.0 certification if practical. The raw benchmark ZIP is now durably backed up on Drive, so it can be reintroduced into a future GitHub Actions run or a new conversation without relying on the current chat.

If same-version certification remains comparable, promote AKAZE to the primary local recognizer and benchmark mobile runtime/memory before wiring it into the live lab.

## Intended eventual architecture if robustness holds

`capture → 10 proportional crops → AKAZE local matching → shortlist → soft team coherence from war-counters.json → constrained remote vision only if genuinely ambiguous → automatic result`

Known defense compositions must add a coherence bonus only. A 4/5 known composition plus a strong visually detected new fifth character must remain possible, so new team variants can be discovered rather than forced into an existing JSON composition.

User requirement: the workflow should ideally require zero manual correction and be faster than manually copy/pasting a team name + five characters into Google Sheets.
