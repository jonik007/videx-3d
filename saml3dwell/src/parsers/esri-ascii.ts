export type EsriAsciiGrid = {
  ncols: number;
  nrows: number;
  xll: number;
  yll: number;
  xllIsCenter: boolean;
  yllIsCenter: boolean;
  dx: number;
  dy: number;
  nodata: number;
  /** Row-major, file order: the first row is the northernmost. */
  values: Float64Array;
};

const HEADER_KEYS = new Set([
  'ncols',
  'nrows',
  'xllcorner',
  'yllcorner',
  'xllcenter',
  'yllcenter',
  'cellsize',
  'dx',
  'dy',
  'nodata_value',
]);

const NUMBER = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

export function isNodata(value: number, nodata: number) {
  if (!Number.isFinite(value)) return true;
  if (value > 1e20 || value < -1e20) return true;
  const tolerance = 1e-5 * Math.max(1, Math.abs(nodata));
  return value === nodata || Math.abs(value - nodata) <= tolerance;
}

export function parseEsriAsciiGrid(text: string): EsriAsciiGrid {
  const header: Record<string, number> = {};
  const data: number[] = [];
  let headerOpen = true;

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    if (headerOpen) {
      const match = /^([A-Za-z_]+)\s+(\S+)\s*$/.exec(line);
      if (match && HEADER_KEYS.has(match[1].toLowerCase())) {
        const key = match[1].toLowerCase();
        if (!NUMBER.test(match[2])) {
          throw new Error(`Нечисловое значение заголовка ${key}: ${match[2]}`);
        }
        header[key] = Number(match[2]);
        continue;
      }
      headerOpen = false;
    }

    for (const token of line.split(/[\s,]+/)) {
      if (!token) continue;
      if (!NUMBER.test(token)) {
        throw new Error(`Нечисловое значение сетки: ${token}`);
      }
      data.push(Number(token));
    }
  }

  const ncols = header.ncols;
  const nrows = header.nrows;
  if (!Number.isInteger(ncols) || ncols <= 0) {
    throw new Error('В заголовке ESRI ASCII Grid нет положительного ncols');
  }
  if (!Number.isInteger(nrows) || nrows <= 0) {
    throw new Error('В заголовке ESRI ASCII Grid нет положительного nrows');
  }

  const xllIsCenter = header.xllcenter !== undefined && header.xllcorner === undefined;
  const yllIsCenter = header.yllcenter !== undefined && header.yllcorner === undefined;
  const xll = xllIsCenter ? header.xllcenter : header.xllcorner;
  const yll = yllIsCenter ? header.yllcenter : header.yllcorner;
  if (xll === undefined || yll === undefined) {
    throw new Error('Нужны xllcorner/xllcenter и yllcorner/yllcenter');
  }

  const dx = header.dx ?? header.cellsize;
  const dy = header.dy ?? header.cellsize ?? header.dx;
  if (dx === undefined || dy === undefined || dx === 0 || dy === 0) {
    throw new Error('Нужен ненулевой cellsize или dx/dy');
  }

  const expected = ncols * nrows;
  if (data.length !== expected) {
    throw new Error(
      `Ожидалось ${expected} значений (ncols × nrows), получено ${data.length}`,
    );
  }

  return {
    ncols,
    nrows,
    xll,
    yll,
    xllIsCenter,
    yllIsCenter,
    dx,
    dy,
    nodata: header.nodata_value ?? -9999,
    values: Float64Array.from(data),
  };
}

/** Column/row of a cell center. Row 0 is the southernmost row. */
export function cellCenter(
  grid: EsriAsciiGrid,
  col: number,
  rowFromSouth: number,
): [number, number] {
  const lon0 = grid.xllIsCenter ? grid.xll : grid.xll + grid.dx / 2;
  const lat0 = grid.yllIsCenter ? grid.yll : grid.yll + grid.dy / 2;
  return [lon0 + col * grid.dx, lat0 + rowFromSouth * grid.dy];
}

export function valueAt(
  grid: EsriAsciiGrid,
  col: number,
  rowFromSouth: number,
) {
  const fileRow = grid.nrows - 1 - rowFromSouth;
  return grid.values[fileRow * grid.ncols + col];
}

export function gridExtent(grid: EsriAsciiGrid) {
  const west = grid.xllIsCenter ? grid.xll - grid.dx / 2 : grid.xll;
  const south = grid.yllIsCenter ? grid.yll - grid.dy / 2 : grid.yll;
  return {
    west,
    south,
    east: west + grid.ncols * grid.dx,
    north: south + grid.nrows * grid.dy,
  };
}

export function gridValueStats(
  grid: EsriAsciiGrid,
  depthPositiveDown: boolean,
) {
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  for (let i = 0; i < grid.values.length; i++) {
    const raw = grid.values[i];
    if (isNodata(raw, grid.nodata)) continue;
    const elevation = depthPositiveDown ? -raw : raw;
    count += 1;
    if (elevation < min) min = elevation;
    if (elevation > max) max = elevation;
  }
  return {
    min: count ? min : 0,
    max: count ? max : 0,
    count,
  };
}

/** Bilinear sample of the raw grid value. Null outside the grid and on NODATA. */
export function sampleGrid(
  grid: EsriAsciiGrid,
  longitude: number,
  latitude: number,
) {
  const lon0 = grid.xllIsCenter ? grid.xll : grid.xll + grid.dx / 2;
  const lat0 = grid.yllIsCenter ? grid.yll : grid.yll + grid.dy / 2;
  const col = (longitude - lon0) / grid.dx;
  const row = (latitude - lat0) / grid.dy;
  if (col < -0.5 || row < -0.5 || col > grid.ncols - 0.5 || row > grid.nrows - 0.5) {
    return null;
  }
  const c0 = Math.max(0, Math.min(grid.ncols - 1, Math.floor(col)));
  const r0 = Math.max(0, Math.min(grid.nrows - 1, Math.floor(row)));
  const c1 = Math.min(grid.ncols - 1, c0 + 1);
  const r1 = Math.min(grid.nrows - 1, r0 + 1);
  const tx = Math.min(1, Math.max(0, col - c0));
  const ty = Math.min(1, Math.max(0, row - r0));
  const raw = (c: number, r: number) => {
    const value = valueAt(grid, c, r);
    return isNodata(value, grid.nodata) ? null : value;
  };
  const samples: [number | null, number][] = [
    [raw(c0, r0), (1 - tx) * (1 - ty)],
    [raw(c1, r0), tx * (1 - ty)],
    [raw(c0, r1), (1 - tx) * ty],
    [raw(c1, r1), tx * ty],
  ];
  let weight = 0;
  let sum = 0;
  for (const [value, share] of samples) {
    if (value === null || share === 0) continue;
    weight += share;
    sum += value * share;
  }
  if (weight === 0) return null;
  return sum / weight;
}

/** Integer step that keeps the displayed lattice near the given cell budget. */
export function displayStride(ncols: number, nrows: number, budget = 500_000) {
  const cells = ncols * nrows;
  if (cells <= budget) return 1;
  return Math.max(1, Math.ceil(Math.sqrt(cells / budget)));
}
