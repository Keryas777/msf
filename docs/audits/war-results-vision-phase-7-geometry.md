# War Results Vision — Phase 7 geometry diagnostics

Date: 18 November 2026
PR: #697, draft
Scope: local, experimental trophy comparison diagnostics

## Code-path findings

The production form and the existing adaptive comparator do not use the same rectangle calculation:

- The form uses `WarResultRecognition.locateZones`. It finds OCR word boxes from the sparse full-image Tesseract pass. For trophies, it selects a four-digit OCR token when available and pads the token box by a fraction of image height; otherwise it uses a wider fallback rectangle tied to the LoSP/name anchor or proportional layout.
- The comparator runs a separate full-image and sparse-image read to recover the layout and vertical trophy band. It then searches a side-dependent proportional horizontal band in the original color pixels. The existing segmenter selects a coherent run of four color components and adds padding based on their median glyph height. Its OCR crop is made from that refined rectangle.
- Thus the production crop may include content covered by a broad OCR word box or fallback zone. The adaptive crop may differ because it discards the production x coordinate, segments four components, and bounds the selected glyph run. This is a code-level explanation for possible variation, not proof of what happened in a particular capture.
- Score, alliance-name, and victory/defeat rectangles are not part of this adaptive trophy comparison. The production crop generation and recognition rules for those fields remain unchanged.

The adaptive segmenter operates on original-image pixels from the source image. Both locator rectangles and component rectangles are kept in original-image coordinates; only the debug glyph bounds were previously relative to the crop passed to the segmenter.

## Phase 7 changes

- The live A/B card now overlays the current and adaptive trophy rectangles on a downscaled copy of the original capture. It also overlays the segmented glyph boxes for each variant.
- Each variant shows the actual grayscale, contrast-adjusted, 3× canvas passed to Tesseract.js v5. A collapsible view shows its unprocessed crop at source resolution.
- Cards show field identity, rectangle coordinates and dimensions, adaptive margin, detected glyph count, raw OCR text, result, confidence, and OCR duration.
- Adaptive glyph bounds are translated from band-local coordinates to the original-image coordinate space before they are drawn.
- Image previews remain transient in the active page. The JSON store/export now drops every property whose name ends in `Preview` (case-insensitive), including both source crops and the full-image diagnostic preview. Results remain separated by margin, and legacy results still default to 18%.
- Alliance names, scores, victory/defeat handling, the production locator, War Counter Vision, and historical data are untouched.

No third locator was added: current inputs do not contain the nine original benchmark captures needed to show a visual failure and demonstrate a third strategy's improvement.

## Validation performed

Synthetic tests cover proportional bands at multiple resolutions, conversion to original-image coordinates, four-component detection/refusal, invalid bands, A/B result separation by margin, 18% legacy migration, and removal of image data from JSON exports. Static checks cover the comparison UI's source overlay, glyph diagnostics, and distinction between OCR input and source crops.

The nine original captures were not present in this session. Therefore no claim is made that a specific real crop fully contains its four expected digits, excludes its icon/bracket change, or is stable across the real corpus. No Tesseract benchmark was run. The previously reported 5/18 vs 14/18 and 6/18 vs 15/18 totals remain separate historical runs; they are not updated or reconciled here.

## Next evidence needed

To validate rectangles against actual pixels, provide the nine original distinct captures in this session. Inspect overlays and OCR-input crops for both existing locators before running any targeted Tesseract.js comparison. The same visual review should verify names, scores, and the victory/defeat band if those rectangles are changed later.

