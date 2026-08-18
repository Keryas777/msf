# War Counter Vision — R5 AKAZE mobile shortlist benchmark

Date: 2026-08-18

This checkpoint records the browser/mobile-oriented shortlist experiment after the final same-version AKAZE certification.

## Source run

GitHub Actions run:

`https://github.com/Keryas777/msf/actions/runs/32184774257/job/95865769394`

Branch:

`agent/war-counter-r5-embeddings-benchmark`

Trigger commit:

`f5c42740edea50848978b1efe677716fa003aa6f`

Pinned runtime:

- OpenCV `4.10.0`
- 450 reference portraits
- 93,263 AKAZE descriptors
- exact committed R5 fixture

Generated report:

`benchmark-r5-akaze-mobile-shortlist-report.json`

Artifact:

- ID: `9342115099`
- ZIP SHA-256: `fec0041b6f0775c7e2d59bad0c52f49026939ce488e1bc49e55cb929992d3a91`
- final artifact size: 4,658,298 bytes

## Experiment

The experiment tests a two-stage architecture intended to reduce the cost of exact matching on mobile:

`query AKAZE descriptors -> global descriptor search/vote -> candidate shortlist N -> exact AKAZE refinement only inside N`

Shortlist sizes tested: 10, 20, 30, 40, 60.

The benchmark covers all 80 R5 crops: 10 characters × 8 crop perturbations.

## Global descriptor stage

Aggregate result:

- count: 80
- Top1: 79/80 = 98.75%
- Top5: 79/80 = 98.75%
- Top10: 80/80 = 100%
- Top20: 80/80 = 100%
- Top30: 80/80 = 100%
- Top40: 80/80 = 100%
- Top60: 80/80 = 100%
- mean rank: 1.075
- worst rank: #7

Timing on the GitHub Actions CPU runner:

- mean global stage: 85.416 ms/crop
- p95 global stage: 118.064 ms/crop

These are server-runner measurements only and must not be presented as mobile timings.

The only global-stage result outside Top1 is the artificial `D5 Deadpool / red-neutral` crop, rank #7. All normal `base` crops are rank #1, including Deadpool.

## Shortlist recall and exact refinement

| N | Recall truth in shortlist | Refined Top1 | Refined Top5 | Mean refine | p95 refine |
|---:|---:|---:|---:|---:|---:|
| 10 | 80/80 (100%) | 77/80 | 80/80 | 2.627 ms | 3.695 ms |
| 20 | 80/80 (100%) | 76/80 | 80/80 | 5.175 ms | 7.191 ms |
| 30 | 80/80 (100%) | 76/80 | 80/80 | 7.847 ms | 11.044 ms |
| 40 | 80/80 (100%) | 75/80 | 80/80 | 10.510 ms | 14.718 ms |
| 60 | 80/80 (100%) | 75/80 | 80/80 | 15.849 ms | 22.159 ms |

## Decision

The smallest tested shortlist, **N=10**, already preserves the true character in **80/80** cases and keeps **80/80 in refined Top5**.

There is therefore no benchmark evidence supporting a larger N. Increasing N adds cost and slightly reduces refined Top1 by introducing more competing candidates.

More importantly, the global descriptor stage itself is currently the strongest signal on this perturbation set: **79/80 Top1**, versus **72/80 Top1** for exhaustive per-reference AKAZE matching in the final 80-crop certification.

Production should therefore not automatically replace the global result with exact-refinement Top1.

Current preferred recognition logic for the next browser feasibility phase:

`crop -> AKAZE query descriptors -> global descriptor ranking -> accept strong Top1 when unambiguous -> otherwise exact refinement on Top10 -> soft team coherence -> constrained remote fallback only if still ambiguous`

`war-counters.json` remains a soft coherence signal only. It must never remove a visually strong candidate because that candidate is absent from known defense compositions.

## Next step

Do not wire this into production yet.

The next gate is a **real browser/mobile feasibility benchmark** in the private lab:

- feature-extraction availability in browser;
- payload size and decode cost for reference descriptors;
- memory use, especially iOS Safari;
- global Hamming-search runtime per crop and for ten crops;
- UI responsiveness with sequential processing/yields;
- iOS Safari, Android Chrome, installed PWA, and Discord browser compatibility.

The GitHub-runner timings are useful for algorithm comparison only, not as a mobile performance guarantee.
