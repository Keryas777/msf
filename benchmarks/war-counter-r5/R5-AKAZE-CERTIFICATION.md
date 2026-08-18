# War Counter Vision — R5 AKAZE final certification

Date: 2026-08-18

GitHub Actions run:

`https://github.com/Keryas777/msf/actions/runs/32158206887/job/95780440730`

Commit under test:

`b3d6f0f6458030448b4faea0186e90bbc4724581`

## Reproducible environment

- Python 3.11.15
- OpenCV 4.10.0
- `opencv-contrib-python-headless==4.10.0.84`
- AKAZE threshold: `0.0008`
- reference resize max side: 320 px
- official portrait references: 450
- exact benchmark fixture committed in the repository: `benchmarks/war-counter-r5/fixtures/war-counter-r5-benchmark-1786421094500.zip`
- fixture size: 689,033 bytes
- fixture SHA-256: `147138e710e63e30f23984efd4d8e6a0fddc83dcbb6a073de7c7cad674831b9a`

The workflow verified the fixture size and SHA-256 before running the benchmark.

## Final 80-crop AKAZE result

Aggregate result across 10 characters × 8 crop variants:

- Top1: **72/80 = 90.0%**
- Top5: **77/80 = 96.25%**
- Top10: **80/80 = 100%**
- Top20: **80/80 = 100%**
- mean rank: **1.425**
- worst rank: **#10**

This confirms the earlier cross-version robustness probe exactly. The result is therefore no longer provisional: it was reproduced entirely in GitHub Actions with OpenCV 4.10.0 for both references and query crops.

## Exact ranks by character and variant

Order: `base / tight / loose / shift-left / shift-right / shift-up / shift-down / red-neutral`.

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

Seven of the ten characters are rank #1 on all eight variants. All 80 queries retain the true character inside Top10, and therefore comfortably inside the intended shortlist.

## Base-crop feature comparison from the same run

ORB:

- Top1 9/10
- Top5 9/10
- Top10 9/10
- Top20 9/10
- mean rank 3.5
- Venom #26
- RetCon team #1

AKAZE:

- Top1 10/10
- Top5 10/10
- Top10 10/10
- Top20 10/10
- mean rank 1.0
- all ten base crops rank #1
- RetCon team #1

ORB + AKAZE RRF:

- Top1 10/10
- Top5 10/10
- Top10 10/10
- Top20 10/10
- mean rank 1.0
- RetCon team #1

## Decision

AKAZE is validated as the primary visual shortlist engine for the R5 War Counter Vision pipeline.

This benchmark validates recognition quality and perturbation robustness. It does **not** yet validate the production mobile implementation, because Python/OpenCV AKAZE cannot simply be assumed to exist in iOS Safari, Android Chrome, PWA or the Discord browser.

The next required phase is therefore a mobile feasibility/performance benchmark before production wiring:

1. determine the lightest browser-compatible implementation of the required local-feature operations;
2. precompute and publish reference descriptors at build time rather than downloading/reprocessing 450 portraits on the phone;
3. measure library/download size, descriptor data size, peak memory, per-crop time and total 10-crop time on mobile;
4. preserve `war-counters.json` as a soft coherence bonus only, never a closed-world filter;
5. use constrained remote vision only for genuinely ambiguous local results.

Target production flow:

`capture → 10 proportional crops → local feature matching → shortlist → soft team coherence → remote constrained choice only if ambiguous → automatic result`

No manual correction should be required in the normal known-team case, and the workflow must remain faster than manually entering the team composition.