# Renseignements de guerre

The versioned file `war-intelligence.json` is the shared source for public alliance names and published defensive layouts. The existing Cloudflare Worker for Cosmic Defenses exposes a public `GET /api/war-intelligence` route and an owner-only `POST` route. Writes use the existing `LOSP_AUTH` service binding and atomic GitHub commit flow.

## Data format

- `schemaVersion` is `1`.
- `alliances[].id` is a stable generated identifier. `name` is the manually maintained classic name.
- `richName` is optional. Version 1 is `{ "schemaVersion": 1, "segments": [{ "text": "…", "color": "#aabbcc", "symbol": "◆" }] }`. Only valid hex colors are rendered. The classic name is the fallback.
- `observations[]` contains one published record per `allianceId` + `date`. A correction replaces that record in place; another date creates an independent record. Alliance IDs are stable and records never store a display name.
- `layout` contains nine entries corresponding to the nine internal positions. A room ID or `null` is allowed; each known room can appear at most once. The three flight decks are fixed UI positions.
- Deleting a record removes it from the business data permanently. Other dates for that alliance remain unchanged.

## Access and publication

The static admin page is not an access boundary. Every write requires a fresh signed Discord session validated by `/signed-me`, Discord role `admin`, and the explicit project owner ID `300305626926415874`. The Worker then uses its existing `GITHUB_TOKEN` secret to commit the JSON file to `main`; no token is sent to the browser.

Drafts are saved in the current browser's localStorage and are not published. Published changes are public through the Worker immediately and subsequently through GitHub Pages. GitHub's commit history preserves the prior data versions.

To exercise the public map with fictional data, open `renseignements-guerre.html?demo=1`. The normal route never loads that fixture.
