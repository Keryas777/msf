# War Results Vision — score localization V0.2.0, phase 1

## Scope and decision

This draft delivers a measurement and pipeline-diagnostic phase. The five original captures are not present in the Work workspace, so no MSF RGB/HSV reference color or final V0.2.0 detector threshold can be established here. Keep the V0.2.0 mask and ranking experiments provisional until Jérôme returns source-pixel measurements from Safari iOS. No OCR or Template Matching is part of this phase.

The V0.1.0 locator remains the reference. Its `locate`, pixel predicate, grouping constants, selection ranking, retries and crop output are unchanged. New APIs are additive diagnostics and do not feed measurements back into localization.

## Baseline audit

- Reference `main`: merge commit `968db3ae3fa5d2600093cba5361b1c67b9936f85`.
- Existing PR #743 files are in that commit; the report `docs/audits/war-results-score-localization-2026-11.md`, module, laboratory, tests and library opt-in were inspected.
- `docs/war-results-score-locator-experiment.js` uses the V0.1.0 `isYellowPixel` mask, 8-connected components, minimum area, row grouping and heuristic ranking. It reports candidates after component finding/grouping, not raw pixel color distributions, tiny components, or rejected-component reasons. Thus an export cannot currently identify whether Athena’s true score pixels failed the color mask, were lost in connected components, were filtered, or failed grouping.
- `war-results-vision.js` restores an uncertain candidate preview even when `localized` is false. The V0.2 diagnostic UI must keep this clearly marked for diagnosis; callers must not treat it as a reliable library crop.

## What the Safari export establishes

The user-provided JSON has ten records at the five stated source dimensions. V0.1.0 succeeds on eight and reports the two Athena fields as uncertain. The JSON confirms:

- Athena LoSP: a 1-component candidate (30 × 26) and a 2-component candidate (60 × 22), both with strong individual geometry ranks; the engine abstains as `multiple-plausible-groups`. No six-glyph score group appears in the exported final candidates.
- Athena opponent: V0.1.0 selects a single 19 × 40 component at the search edge (final preview 29 × 50); the expanded search from source pixels does not recover a reliable score. The same export also contains a lower-ranked four-component candidate at the edge.
- The saved V0.1.0 record gives only 33 / 27 components after its current area and mask filtering for these searches. There is no count before the area filter or per-component color evidence. This cannot establish whether the true score pixels were rejected by color, fragmented, removed by area/geometry, or omitted by grouping.

These are pipeline observations, not a cause attribution. JPEG compression, image aspect ratio, color mask, neighboring gold artwork and candidate ranking remain hypotheses until samples are measured from the original image.

## Phase 1 tooling

The existing score comparator now adds two diagnostics without changing its V0.1.0 result:

1. **Automatic search trace:** region coordinates, total pixels, current mask acceptance/rejection and reason counts, raw connected-component count, components accepted by the existing minimum-area rule, rejected small components, components not included in plausible groups, candidate dimensions, baseline spread, height variation, gap, density, heuristic confidence and rank. A note states that rank is not a probability. Accepted and small rejected components can be outlined on the original capture.
2. **Manual original-pixel sampler:** choose an imported capture and annotate whether the sample is LoSP or opponent, then drag over a small region on the original-resolution canvas. The module measures that rectangle directly from the imported source via Canvas `getImageData`, not from its scaled preview. It returns RGB and HSV ranges/quantiles, six channel histograms, dominant quantized RGB bins, mask acceptance/rejection fractions and reasons, and accepted-mask core versus boundary statistics. A mask preview shows cyan accepted pixels and red rejected pixels.

The JSON export stores measurements and ROI coordinates but never source pixels, crops, images or OCR output. The sample-label field is annotation only. It does not affect the locator. The canvas drag is pointer-based for touch support and the sample lives only in this browser session/export.

The measured accepted-mask core/boundary distinction is a neighborhood diagnostic, not a claim that pixels have been semantically identified as glyph ink. The user should draw the ROI tightly around score glyphs and immediate antialiased edges, excluding as much unrelated artwork as possible.

## Remaining work after measurements

Use source-pixel measurements from scores over both red and blue fields, including the two Athena failures and representative successful PNG/JPEG captures, to determine candidate provisional color prototypes. Then isolate and test threshold, geometry, joint-pair, and targeted-retry variants separately against the eight user-confirmed successful crops. Do not change V0.1.0 or its stored evidence. Do not enable any experimental method in the library by default. The expected 10/10 outcome remains unverified.

## Safari iOS protocol — phase 1

1. Open the official `war-results-vision.html` page after this draft is eventually approved, merged, and deployed. Refresh; if stale, close and reopen the tab to load the versioned CSS/JS resources.
2. Import the five original captures with **Choisir des captures**. Leave **Analyser les captures** unused; this work is pixel geometry/color measurement only.
3. In **Laboratoire expérimental**, choose **Numérique**. In **Scores et trophées**, choose **2 scores** (or choose one score for isolated checks). Ensure both trophy fields are unchecked.
4. Keep **Localisation initiale des quatre zones** at **Proportionnelle actuelle**. The score comparison uses this only as its baseline and initial search anchor.
5. Keep **Localisateur des trophées** at **Reprise + corrections combinées (référence)** and **Marge des glyphes** at **18 %**. Both settings are irrelevant to score comparison and color sampling.
6. Leave all trophy A/B settings and the OCR comparator untouched. Do not press **Lancer le moteur Numérique**, any OCR comparison control, or **Analyser les captures**.
7. Press **Comparer les scores sélectionnés** to record current V0.1.0 per-field pipeline traces. For color sampling, open **Mesurer les couleurs des pixels source**; choose the original capture from **Capture originale**, choose **Score LoSP** or **Score adverse** under **Champ repéré (annotation seulement)**, then drag directly over the original source canvas across several digits and their antialiased edges. Repeat with tightly cropped samples for each side and for examples on red and blue backgrounds. Include both Athena fields and several of the eight confirmed successful fields. Do not enter any score value.
8. Press **Mesurer la zone sélectionnée**. The mask canvas uses cyan for pixels accepted by the unchanged V0.1.0 predicate and red for rejected pixels. The JSON summary reports the actual selected source-pixel RGB/HSV distribution, not colors inferred from a resized card. Repeat by drawing a new rectangle; the latest measurement is appended.
9. Press **Copier les diagnostics JSON** or **Télécharger les diagnostics JSON**. The export combines the automatic trace and all measured ROI statistics. Send back that JSON through the ordinary project workflow; no image bytes are included.

No final V0.2.0 thresholds or 10/10 claim should be issued before inspecting those source measurements and running the later real-capture validation.
