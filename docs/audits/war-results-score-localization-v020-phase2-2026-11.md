# War Results Vision — V0.2.0 phase 2

Date: 26 November 2026
Base: `main` at `099b4f6bc5b83241c986e9ca81f7106bf249c6ed`
Production SHA previously reported: `13d0ff48e624700a7b0e0b437e6791b78a537e4e`
Scope: experimental score localization only; no merge, deployment, OCR, or real-capture validation in this change.

## Baseline and repository review

The current `main` descends from the reported production SHA. Its latest commit before this branch changes only automated season-rules data. PR #744's merged phase-1 implementation, its current diagnostics, the V0.1.0 module, the existing laboratory, tests, and the user-provided original Safari JSON diagnostics were examined before implementation. No open score-localization PR was found; the open PR search result was unrelated PR #706.

The original capture images were not present in the checkout. The JSON diagnostic report was available and contains component coordinates and geometry, but not source image pixels. Therefore the Athena root-cause reproduction below uses only component geometry transcribed from that report; it does not claim a local image or real-capture benchmark.

## V0.1.0 Athena failure: confirmed path

The unchanged V0.1.0 code at `docs/war-results-score-locator-experiment.js` builds row runs in `groupComponents()` (around lines 169–193), then `makeCandidate()` validates the run (around lines 195–212). Candidate ranking occurs only after a run passes that validation.

The source diagnostic confirms that all six LoSP score components were accepted by the unchanged color mask and area filter. They are at `y=492`, height `52`, with widths 38–48 px. All six adverse-score glyphs were also accepted at `y=492`, height `52`, with widths 40–48 px. Thus the first loss is after mask, connected-component extraction, and area filtering.

| Field | True glyph components | Small accepted specks | V0.1 outcome |
|---|---:|---:|---|
| Athena LoSP | 6, all 52 px high | 2, heights 1 and 2 px | One row run is built, then rejected |
| Athena opponent | 6, all 52 px high | 1, height 3 px | One row run is built, then rejected |

The V0.1 row builder orders components by x and uses a center-line tolerance of `0.36 × glyph height`. In both exported component sets, the specks fall inside the glyph run. `makeCandidate()` measures the full max-minus-min baseline spread, including those tiny specks, then rejects when it exceeds `0.48 × median height`. The thresholds are 34 px versus 24.96 px for LoSP, and 27 px versus 24.96 px for the opponent. The true row is therefore discarded before candidate scoring. The exported `not-in-plausible-row-group` label obscures that intermediate run: replaying the unchanged functions against the exported components confirms a run is built and rejected by the candidate validity check.

The opponent portrait fragment is a separate false positive: component `(2727,643,19×40)` survives and is ranked as a singleton. V0.1's confidence formula gives a singleton a high value when its height spread and baseline spread are zero; its exported heuristic rank is about `0.9325`. That explains why the portrait fragment can beat a multi-component but incoherent nuisance candidate. This is a second defect after the true score row has already been removed.

### Confirmed and unconfirmed causes

Confirmed:

- The genuine digits pass V0.1's color mask, connected-component extraction, and minimum-area filter in the original report.
- The tiny accepted specks join the true score row and make its baseline-spread check fail. This is the first confirmed loss for both Athena fields.
- V0.1's singleton score can rank an isolated portrait fragment above a real multi-component alternative.
- The screenshot-coordinate values and component positions are internally consistent in the exported report; no local/original coordinate conversion defect was found in this path.

Not established:

- Whether JPEG compression caused the tiny specks. The source pixels are unavailable, and no color statistics were collected.
- Whether the portrait component is yellow character art by color alone; it is visually identified as portrait art in Safari, while its report establishes only its geometry and mask acceptance.
- Whether another untested screenshot triggers additional grouping or threshold failures.

No evidence points to the mask thresholds, minimum component area, expected field position, glyph width variation, or a fixed six-digit assumption as the cause in these two exported cases.

## V0.2.0 experimental strategies

New implementation: `docs/war-results-score-locator-v020-experiment.js`. It calls the V0.1.0 pixel-mask and connected-component implementation without editing that file. It does not use OCR or score values.

### Geometry grouping

Components are sorted deterministically and partitioned into vertical families using relative height and alignment checks. Each family is independently split into horizontal runs. The current tunable defaults are:

| Parameter | Default | Purpose |
|---|---:|---|
| Minimum area | 3 px | Same threshold as the reference mask pipeline |
| Minimum height ratio | 0.42 | Keeps specks and substantially different component scales out of the glyph family |
| Center offset | 0.34 × larger height | Vertical family compatibility |
| Top/bottom edge offset | 0.42 × larger height | Allows italic and antialias variation without a fixed 52 px scale |
| Maximum horizontal gap | 1.9 × local glyph height | Allows spaces and thousands separators while keeping distant art separate |
| Geometry-only search | Same as V0.1.0: ±7.5% image width, ±5.5% image height | Makes the regrouping ablation comparable to the reference window |
| Anchor-priority crop expansion | 16% width, 24% height of proportional crop | First pass for anchored/joint strategies; includes near-edge continuations |
| Stage B expansion | ±7.5% image width, ±5.5% image height | Targeted retry from original pixels |
| Wide retry | ±12% image width, ±10% image height | Used only when the earlier candidate is absent, uncertain, or near an edge |
| Crop padding | 14% median glyph height, min 2 px | Keeps slanted glyph extents and a small border |
| Group acceptance | ≥2 components, geometry ≥0.62, score ≥0.66, score gap ≥0.065 | Abstains on isolated or ambiguous evidence |

The two Athena geometric reproductions confirm that the six 52 px glyphs form a group while the 1–3 px specks form separate families. A large portrait component likewise cannot set a single global glyph height. Families are established from sorted data, so input traversal order does not decide membership. Horizontal overlap of bounding boxes is allowed; widths may differ and no digit count is fixed.

The heuristic score reports separate contributions for collective support, height consistency, vertical alignment, spacing, density, singleton penalty, and (when enabled) anchor proximity. It is a ranking aid, not a calibrated probability. A singleton is penalized and cannot be accepted by independent geometry alone.

### Progressive anchor and recovery

The geometry-only variant starts in V0.1.0's proportional-expanded window and changes the grouping/scoring behavior, so it isolates the regrouping contribution. The anchored and joint variants first search a tighter proportional-priority window and add anchor proximity to ranking. Every stage re-runs mask/component extraction against the original full-resolution image data. Groups that extend outside the proportional crop, lie near a search edge, or are otherwise uncertain cause the relevant targeted stage to run. Candidate glyphs from successive regions are coalesced; a more complete version replaces a subset. No image is repeatedly enlarged or cropped for the next pass.

The anchored and joint variants are designed to preserve recovery of the leading digits in the known Poséidon LoSP case: their priority pass expands around the proportional rectangle, and group continuation to its left triggers a fresh source-image search. The geometry-only ablation deliberately starts in V0.1.0's wider window and does not by itself establish clipped-digit recovery. The current first/last-glyph tests are synthetic, not a new Safari result.

### Joint score localization

The joint strategy runs both score searches even when the user selected only one side for display. It compares coherent groups using relative height and vertical alignment, without requiring equal widths or digit counts. A pair of singletons is rejected. One singleton can be accepted only when its anchored evidence is strong and the opposite field supplies a coherent row. If both ordinary strategies already produced reliable results, the joint strategy leaves those crops unchanged; otherwise it can guide or abstain. The result records the opposite-side diagnostics and pair evidence.

## Interface and exports

The existing score comparator now exposes four independent checkboxes: V0.1.0 reference, V0.2 geometry, V0.2 anchored, and V0.2 joint. The current proportional crop remains visible for every field. Detailed component, family, candidate, rejection, score, stage, extension, and timing data is in expandable result cards. Uncertain candidate previews are labeled diagnostic-only; `finalRect` is null unless a candidate passes the reliability gate.

The existing buttons remain the only controls needed to run and export: **Comparer les scores sélectionnés**, **Copier les diagnostics JSON**, and **Télécharger les diagnostics JSON**. The JSON schema now includes V0.2 results and keeps manual visual quality annotations. Existing color measurement controls remain independent; no measurements are required for this phase and no mask parameter has been changed.

The numeric-library constructor was not modified or wired to V0.2. Its existing explicit V0.1 experimental choice remains as it was; no V0.2 strategy is activated for library extraction. No library references, IndexedDB records, screenshots, or image crops were added to the repository.

## Test evidence and remaining validation

Automated result: **87/87 tests pass** (70 existing targeted tests retained, 17 new V0.2 tests). The new synthetic/component fixtures cover Athena geometry from exported diagnostics, speck isolation, large and small parasites, order-independent grouping, separate rows, italic bounding-box overlap, varied widths and lengths, singleton rejection, first/last glyph recovery, original-image coordinate offsets, progressive-window ablation, joint cases, ambiguity, and V0.1 output/mask invariance. `node --check` and `git diff --check` pass.

These results establish test behavior only. They do not establish ten successful real-image crops, ten of ten success, mobile timing, or Safari/Android behavior. Those require the owner's five original captures after an explicitly authorized merge/deployment. No OCR or local OCR benchmark was run.

## Safari iOS validation protocol after authorized publication

Use the published page `https://keryas777.github.io/msf/war-results-vision.html` after refreshing it.

1. Under **Captures de résultats**, press **Choisir des captures** and select the five original images in the order Poséidon, Dionysos, Zeus, Athéna, Kronos. Do not press **Analyser les captures**.
2. Under **Laboratoire expérimental**, set **Moteur** to **Numérique**.
3. In **Scores et trophées**, select **2 scores** if the quick choices are shown. Verify the four field checkboxes: **Score LoSP** and **Score adverse** checked; **Trophées LoSP** and **Trophées adverses** unchecked.
4. Set **Localisation initiale des quatre zones** to **Proportionnelle actuelle**. This defines the same proportional comparison baseline; it does not alter V0.1 or V0.2 pixels.
5. Leave **Localisateur des trophées** at **Reprise + corrections combinées (référence)** and **Marge des glyphes** at **18 %**. Both are irrelevant to this score-only comparator.
6. In **Stratégies à comparer**, leave all four boxes checked: **V0.1.0 — référence inchangée**, **V0.2.0 — regroupement géométrique corrigé**, **V0.2.0 — regroupement + ancrage proportionnel**, and **V0.2.0 — ancrage + localisation conjointe**. This produces direct per-field comparison. The expandable **Paramètres et règles V0.2.0** is informational; no setting is required.
7. Press **Comparer les scores sélectionnés** once. This processes both score fields from all five captures, including both sides for the joint variant. The comparator does not run Tesseract.
8. Review each result card, beginning with the proportional crop and then V0.1, geometry, anchored, and joint results. Inspect the first and last digit, top/bottom tips, separator spacing, neighboring text/art, component families, candidate rejection reasons, margins, extensions, and timing. Open the expandable **Zone, familles et composantes** / detailed diagnostics sections as needed. A candidate-only preview with status *incertain* is not a validated crop; require a non-null final crop and visually confirm it. Use the **Évaluation visuelle** control for each field/variant; this is a manual annotation, not an OCR result.
9. Do not interact with **Mesurer les couleurs des pixels source** unless a separate color investigation is desired; it is not needed here. Do not press **Lancer le moteur sélectionné**, **Analyser les captures**, **Comparer les captures chargées**, any trophy OCR comparison button, or any numeric-library extraction/validation button.
10. After all ten fields and selected variants have been reviewed, press **Télécharger les diagnostics JSON** (or **Copier les diagnostics JSON**) once. The single JSON contains V0.1/V0.2 entries and visual ratings for all completed fields; it excludes image pixels and OCR output. Do not press **Effacer les diagnostics** before export.

Record a field as successful only when the complete crop contains all score digits without meaningful neighboring contamination. The ten-of-ten target remains unverified until these original-image Safari checks are returned.

## Cache references prepared

- CSS: `war-results-vision.css?v=6.7-score-v020-geometry`
- New V0.2 module: `war-results-score-locator-v020-experiment.js?v=0.2.0-geometry-grouping`
- Engine: `war-results-vision-engine.js?v=6.5-score-v020-geometry`
- Page controller: `war-results-vision.js?v=5.4-score-v020-geometry`
- Existing V0.1 module reference: `war-results-score-locator-experiment.js?v=0.1.1-v020-measurement-api`

These references are on the draft branch only and are not published.
