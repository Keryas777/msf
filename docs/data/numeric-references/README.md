# MSF numeric glyph references

This directory is reserved for manually verified MSF digit references. No sample, generated font glyph, test fixture, or unreviewed OCR output belongs here.

The first browser export uses the versioned `msf-numeric-glyph-library` JSON schema. The pure functions exposed by `WarResultsNumericLibrary` (extraction, normalization, shear estimation, schema checks, merge and storage) do not depend on page state; the optional UI initializer is separate from normal analysis and activates only when the library section exists. When a reviewed library is later integrated, keep a shared ten-digit family and preserve the per-reference provenance needed for leave-one-capture-out checks:

- digit, stable reference ID, content fingerprint, validation date, and normalization version;
- source capture ID/hash and dimensions, numeric field, score/trophy category, LoSP/opponent side, and digit position;
- native RGBA pixels and an isolation mask, plus 48×64 aspect-preserving normalization and its optional affine-sheared representation.

The `captureId` is derived from the source image so that a future benchmark can exclude all score and trophy references from one image together. Do not assume that score and trophy glyphs share a typeface until independent captures confirm it.

The browser does not write into this directory or GitHub. Integration requires a separate reviewed change after the owner has exported and checked the first Safari iOS library.
