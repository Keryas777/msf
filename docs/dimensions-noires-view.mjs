export function filterVisibleRosters(rows, selectedAllianceKeys, resolveAllianceKey, isAllianceAllowed) {
  const selected = new Set(
    Array.from(selectedAllianceKeys || []).filter((key) =>
      typeof key === "string" && key.length > 0
    )
  );
  if (!selected.size || typeof resolveAllianceKey !== "function" ||
      typeof isAllianceAllowed !== "function")
    return [];

  return (Array.isArray(rows) ? rows : []).filter((roster) => {
    if (!roster || typeof roster !== "object") return false;
    let key;
    try {
      key = resolveAllianceKey(roster.alliance);
      return typeof key === "string" && selected.has(key) &&
        isAllianceAllowed(key) === true;
    } catch {
      return false;
    }
  });
}

const CELL_WIDTH = 59.6;
const CELL_HEIGHT = 62;
const LEADING_WIDTH = 36; // six-pixel inset plus 30-pixel row labels
const LEADING_HEIGHT = 34; // six-pixel inset plus 28-pixel column labels
const TRAILING_INSET = 6;

export function createMapLayout(map) {
  if (!map || !Array.isArray(map.columns)) return null;
  const columns = map.columns.filter((value) => typeof value === "string" && value);
  if (!columns.length) return null;

  const ids = [
    map.startId,
    ...(Array.isArray(map.combatNodeIds) ? map.combatNodeIds : []),
    ...(Array.isArray(map.portalIds) ? map.portalIds : []),
    ...(Array.isArray(map.visualEdges) ? map.visualEdges.flat() : []),
  ];
  const derivedRows = ids
    .map((id) => typeof id === "string" ? id.match(/^[A-Z]+(\d+)$/)?.[1] : null)
    .filter(Boolean)
    .map(Number);
  const sourceRows = Array.isArray(map.rows) ? map.rows : derivedRows;
  const rows = [...new Set(sourceRows
    .map(Number)
    .filter((row) => Number.isSafeInteger(row) && row > 0))]
    .sort((a, b) => a - b);
  if (!rows.length) return null;

  const width = LEADING_WIDTH + columns.length * CELL_WIDTH + TRAILING_INSET;
  const height = LEADING_HEIGHT + rows.length * CELL_HEIGHT + TRAILING_INSET;
  const percent = (value, total) => (value / total * 100).toFixed(5) + "%";
  const columnTracks = [
    percent(LEADING_WIDTH, width),
    ...columns.map(() => percent(CELL_WIDTH, width)),
    percent(TRAILING_INSET, width),
  ].join(" ");
  const rowTracks = [
    percent(LEADING_HEIGHT, height),
    ...rows.map(() => percent(CELL_HEIGHT, height)),
    percent(TRAILING_INSET, height),
  ].join(" ");

  function indices(id) {
    if (typeof id !== "string") return null;
    const match = id.match(/^([A-Z]+)(\d+)$/);
    if (!match) return null;
    const column = columns.indexOf(match[1]);
    const row = rows.indexOf(Number(match[2]));
    return column < 0 || row < 0 ? null : {column, row};
  }

  function position(id) {
    const index = indices(id);
    if (!index) return null;
    return {
      x: 65 + index.column * CELL_WIDTH,
      y: 65 + (rows.length - 1 - index.row) * CELL_HEIGHT,
    };
  }

  function gridPosition(id) {
    const index = indices(id);
    if (!index) return null;
    return {
      column: index.column + 2,
      row: rows.length + 1 - index.row,
    };
  }

  return {
    columns,
    rows,
    width,
    height,
    columnTracks,
    rowTracks,
    position,
    gridPosition,
  };
}
