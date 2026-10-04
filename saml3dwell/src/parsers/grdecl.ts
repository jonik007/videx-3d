export type EclipseGrid = {
  nx: number;
  ny: number;
  nz: number;
  /** Pillar tops and bottoms, (nx+1)·(ny+1) pillars, 6 values each: x1 y1 z1 x2 y2 z2. */
  coord: Float64Array;
  /** Eight corner depths per cell, Eclipse ZCORN order. */
  zcorn: Float64Array;
  /** 0 = inactive. Missing ACTNUM means every cell is active. */
  actnum: Uint8Array;
  properties: Record<string, Float64Array>;
  warnings: string[];
};

const GEOMETRY_KEYWORDS = new Set([
  'SPECGRID',
  'DIMENS',
  'COORD',
  'ZCORN',
  'ACTNUM',
  'DX',
  'DY',
  'DZ',
  'TOPS',
  'MAPAXES',
  'MAPUNITS',
  'GRIDUNIT',
  'PINCH',
  'NNC',
  'COORDSYS',
  'GDORIENT',
  'INCLUDE',
  'NOECHO',
  'ECHO',
  'FILEUNIT',
]);

const NUMBER =
  /^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/;

function tokenize(text: string) {
  const tokens: string[] = [];
  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r?\n/)) {
    const line = rawLine.replace(/--.*$/, '').trim();
    if (!line) continue;
    for (const token of line.split(/\s+/)) {
      if (token) tokens.push(token);
    }
  }
  return tokens;
}

function isKeyword(token: string) {
  return /^[A-Za-z][A-Za-z0-9_]{0,15}$/.test(token);
}

function expandNumbers(values: string[], keyword: string) {
  const out: number[] = [];
  for (let index = 0; index < values.length; index++) {
    const token = values[index];
    const glued = /^(\d+)\*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eEdD][+-]?\d+)?)$/.exec(
      token,
    );
    const spaced = /^(\d+)\*$/.exec(token);
    let count = 1;
    let raw = token;
    if (glued) {
      count = Number(glued[1]);
      raw = glued[2];
    } else if (spaced) {
      count = Number(spaced[1]);
      raw = values[++index] ?? '';
    }
    const normalized = raw.replace(/[dD](?=[+-]?\d|$)/, 'e');
    if (!NUMBER.test(normalized)) {
      throw new Error(`${keyword}: нечисловое значение «${token}»`);
    }
    const value = Number(normalized);
    if (!Number.isFinite(value)) {
      throw new Error(`${keyword}: нечисловое значение «${token}»`);
    }
    for (let copy = 0; copy < count; copy++) out.push(value);
  }
  return Float64Array.from(out);
}

function takeSized(
  values: Float64Array,
  keyword: string,
  expected: number[],
) {
  if (!expected.includes(values.length)) {
    throw new Error(
      `${keyword}: ожидалось ${expected.join(' или ')} значений, получено ${values.length}`,
    );
  }
  return values;
}

function sampleAt(
  values: Float64Array,
  i: number,
  j: number,
  k: number,
  nx: number,
  ny: number,
) {
  if (values.length === 1) return values[0];
  if (values.length === nx * ny) return values[i + nx * j];
  return values[i + nx * (j + ny * k)];
}

function buildCartesian(options: {
  nx: number;
  ny: number;
  nz: number;
  dx: Float64Array;
  dy: Float64Array;
  dz: Float64Array;
  tops: Float64Array;
  originX: number;
  originY: number;
  xHat: [number, number];
  yHat: [number, number];
}) {
  const { nx, ny, nz, dx, dy, dz, tops, originX, originY, xHat, yHat } = options;
  const xEdge: number[][] = [];
  for (let j = 0; j <= ny; j++) {
    const cellJ = Math.min(j, ny - 1);
    const row = [0];
    for (let i = 0; i < nx; i++) {
      row.push(row[i] + sampleAt(dx, i, cellJ, 0, nx, ny));
    }
    xEdge.push(row);
  }
  const yEdge: number[][] = [];
  for (let i = 0; i <= nx; i++) {
    const cellI = Math.min(i, nx - 1);
    const column = [0];
    for (let j = 0; j < ny; j++) {
      column.push(column[j] + sampleAt(dy, cellI, j, 0, nx, ny));
    }
    yEdge.push(column);
  }

  const mapOf = (gx: number, gy: number) => [
    originX + gx * xHat[0] + gy * yHat[0],
    originY + gx * xHat[1] + gy * yHat[1],
  ];

  const coord = new Float64Array((nx + 1) * (ny + 1) * 6);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const [x, y] = mapOf(xEdge[j][i], yEdge[i][j]);
      const at = (j * (nx + 1) + i) * 6;
      coord[at] = x;
      coord[at + 1] = y;
      coord[at + 2] = 0;
      coord[at + 3] = x;
      coord[at + 4] = y;
      coord[at + 5] = 1;
    }
  }

  const zcorn = new Float64Array(8 * nx * ny * nz);
  const writeFace = (base: number, zAt: (i: number, j: number) => number) => {
    let cursor = base;
    for (let j = 0; j < ny; j++) {
      for (const dj of [0, 1]) {
        for (let i = 0; i < nx; i++) {
          for (const di of [0, 1]) {
            zcorn[cursor++] = zAt(i + di, j + dj);
          }
        }
      }
    }
  };

  for (let k = 0; k < nz; k++) {
    const topAt = (ii: number, jj: number) => {
      const i = Math.min(ii, nx - 1);
      const j = Math.min(jj, ny - 1);
      if (tops.length === nx * ny * nz) return sampleAt(tops, i, j, k, nx, ny);
      let z = sampleAt(tops, i, j, 0, nx, ny);
      for (let above = 0; above < k; above++) z += sampleAt(dz, i, j, above, nx, ny);
      return z;
    };
    const layer = k * 8 * nx * ny;
    writeFace(layer, (ii, jj) => topAt(ii, jj));
    writeFace(layer + 4 * nx * ny, (ii, jj) => {
      const i = Math.min(ii, nx - 1);
      const j = Math.min(jj, ny - 1);
      return topAt(ii, jj) + sampleAt(dz, i, j, k, nx, ny);
    });
  }

  return { coord, zcorn };
}

export function parseGrdecl(text: string): EclipseGrid {
  const tokens = tokenize(text);
  const sections: { keyword: string; values: string[] }[] = [];
  for (let index = 0; index < tokens.length; ) {
    const keywordToken = tokens[index++];
    if (!isKeyword(keywordToken)) {
      throw new Error(`Ожидалось ключевое слово Eclipse, получено «${keywordToken}»`);
    }
    const values: string[] = [];
    while (index < tokens.length && tokens[index] !== '/') {
      values.push(tokens[index++]);
    }
    if (tokens[index] === '/') index += 1;
    sections.push({ keyword: keywordToken.toUpperCase(), values });
  }

  let nx = 0;
  let ny = 0;
  let nz = 0;
  let coord: Float64Array | null = null;
  let zcorn: Float64Array | null = null;
  let actnum: Float64Array | null = null;
  let dx: Float64Array | null = null;
  let dy: Float64Array | null = null;
  let dz: Float64Array | null = null;
  let tops: Float64Array | null = null;
  let mapaxes: Float64Array | null = null;
  const properties = new Map<string, Float64Array>();
  const warnings: string[] = [];

  for (const section of sections) {
    if (section.keyword === 'INCLUDE') {
      warnings.push('INCLUDE не раскрывается: вложите секции в один файл');
      continue;
    }
    if (
      section.keyword === 'MAPUNITS' ||
      section.keyword === 'GRIDUNIT' ||
      section.keyword === 'NOECHO' ||
      section.keyword === 'ECHO' ||
      section.keyword === 'GDORIENT' ||
      section.keyword === 'PINCH' ||
      section.keyword === 'NNC' ||
      section.keyword === 'COORDSYS' ||
      section.keyword === 'FILEUNIT'
    ) {
      continue;
    }
    if (section.keyword === 'SPECGRID' || section.keyword === 'DIMENS') {
      const numbers = section.values
        .filter(value => NUMBER.test(value.replace(/[dD]/, 'e')))
        .map(Number);
      if (numbers.length < 3) {
        throw new Error(`${section.keyword} должен содержать NX NY NZ`);
      }
      nx = numbers[0];
      ny = numbers[1];
      nz = numbers[2];
      continue;
    }
    const numeric = expandNumbers(section.values, section.keyword);
    if (section.keyword === 'COORD') coord = numeric;
    else if (section.keyword === 'ZCORN') zcorn = numeric;
    else if (section.keyword === 'ACTNUM') actnum = numeric;
    else if (section.keyword === 'DX') dx = numeric;
    else if (section.keyword === 'DY') dy = numeric;
    else if (section.keyword === 'DZ') dz = numeric;
    else if (section.keyword === 'TOPS') tops = numeric;
    else if (section.keyword === 'MAPAXES') mapaxes = numeric;
    else if (!GEOMETRY_KEYWORDS.has(section.keyword)) {
      properties.set(section.keyword, numeric);
    }
  }

  if (!Number.isInteger(nx) || !Number.isInteger(ny) || !Number.isInteger(nz) || nx < 1 || ny < 1 || nz < 1) {
    throw new Error('В GRDECL нет SPECGRID или DIMENS с размерами NX NY NZ');
  }

  const cells = nx * ny * nz;
  if (!coord || !zcorn) {
    if (!dx || !dy || !dz) {
      throw new Error(
        'Нужны COORD и ZCORN или декартова геометрия DX, DY, DZ и TOPS',
      );
    }
    const topsValues = tops ?? Float64Array.of(0);
    takeSized(dx, 'DX', [1, nx * ny, cells]);
    takeSized(dy, 'DY', [1, nx * ny, cells]);
    takeSized(dz, 'DZ', [1, nx * ny, cells]);
    takeSized(topsValues, 'TOPS', [1, nx * ny, cells]);
    let originX = 0;
    let originY = 0;
    let xHat: [number, number] = [1, 0];
    let yHat: [number, number] = [0, 1];
    if (mapaxes) {
      takeSized(mapaxes, 'MAPAXES', [6]);
      const yx = mapaxes[0];
      const yy = mapaxes[1];
      originX = mapaxes[2];
      originY = mapaxes[3];
      const xx = mapaxes[4];
      const xy = mapaxes[5];
      const xLength = Math.hypot(xx - originX, xy - originY);
      const yLength = Math.hypot(yx - originX, yy - originY);
      if (xLength === 0 || yLength === 0) {
        throw new Error('MAPAXES задаёт нулевую ось');
      }
      xHat = [(xx - originX) / xLength, (xy - originY) / xLength];
      yHat = [(yx - originX) / yLength, (yy - originY) / yLength];
    }
    const built = buildCartesian({
      nx,
      ny,
      nz,
      dx,
      dy,
      dz,
      tops: topsValues,
      originX,
      originY,
      xHat,
      yHat,
    });
    coord = built.coord;
    zcorn = built.zcorn;
  }

  takeSized(coord, 'COORD', [6 * (nx + 1) * (ny + 1)]);
  takeSized(zcorn, 'ZCORN', [8 * cells]);
  if (actnum) takeSized(actnum, 'ACTNUM', [cells]);

  const kept: Record<string, Float64Array> = {};
  for (const [name, values] of properties) {
    if (values.length === cells) kept[name] = values;
    else {
      warnings.push(
        `${name} пропущен: ${values.length} значений вместо ${cells}`,
      );
    }
  }
  if (!Object.keys(kept).length) {
    throw new Error('В GRDECL нет куба свойств размера NX·NY·NZ');
  }

  const active = new Uint8Array(cells);
  for (let index = 0; index < cells; index++) {
    active[index] = actnum ? (actnum[index] === 0 ? 0 : 1) : 1;
  }

  return {
    nx,
    ny,
    nz,
    coord,
    zcorn,
    actnum: active,
    properties: kept,
    warnings,
  };
}

/** Corner 0..7: top SW, SE, NW, NE, then the same four on the bottom. */
export function zcornAt(
  grid: EclipseGrid,
  i: number,
  j: number,
  k: number,
  corner: number,
) {
  const di = corner & 1;
  const dj = (corner >> 1) & 1;
  const bottom = corner >= 4;
  const layer = k * 8 * grid.nx * grid.ny;
  const face = bottom ? 4 * grid.nx * grid.ny : 0;
  const row = 2 * j + dj;
  const column = 2 * i + di;
  return grid.zcorn[layer + face + row * (2 * grid.nx) + column];
}

export function cellCorner(
  grid: EclipseGrid,
  i: number,
  j: number,
  k: number,
  corner: number,
) {
  const di = corner & 1;
  const dj = (corner >> 1) & 1;
  const z = zcornAt(grid, i, j, k, corner);
  const pillar = ((j + dj) * (grid.nx + 1) + (i + di)) * 6;
  const x1 = grid.coord[pillar];
  const y1 = grid.coord[pillar + 1];
  const z1 = grid.coord[pillar + 2];
  const x2 = grid.coord[pillar + 3];
  const y2 = grid.coord[pillar + 4];
  const z2 = grid.coord[pillar + 5];
  const span = z2 - z1;
  const t = Math.abs(span) < 1e-8 ? 0 : (z - z1) / span;
  return {
    x: x1 + t * (x2 - x1),
    y: y1 + t * (y2 - y1),
    z,
  };
}

export function inferCoordMode(grid: EclipseGrid): 'wgs84' | 'utm' {
  let maxX = 0;
  let maxY = 0;
  const pillars = (grid.nx + 1) * (grid.ny + 1);
  for (let index = 0; index < pillars; index++) {
    const at = index * 6;
    maxX = Math.max(maxX, Math.abs(grid.coord[at]), Math.abs(grid.coord[at + 3]));
    maxY = Math.max(maxY, Math.abs(grid.coord[at + 1]), Math.abs(grid.coord[at + 4]));
  }
  return maxX <= 180 && maxY <= 90 ? 'wgs84' : 'utm';
}

export function defaultPropertyName(grid: EclipseGrid) {
  const names = Object.keys(grid.properties);
  const preferred = ['PORO', 'PERMX', 'PERMY', 'PERMZ', 'SWAT', 'SOIL', 'SGAS'];
  return preferred.find(name => names.includes(name)) ?? names[0];
}

export function propertyStats(grid: EclipseGrid, name: string) {
  const values = grid.properties[name];
  let min = Infinity;
  let max = -Infinity;
  let count = 0;
  if (!values) return { min: 0, max: 0, count: 0 };
  for (let index = 0; index < values.length; index++) {
    if (grid.actnum[index] === 0) continue;
    const value = values[index];
    if (!Number.isFinite(value) || Math.abs(value) >= 1e20) continue;
    count += 1;
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return { min: count ? min : 0, max: count ? max : 0, count };
}

export function cubeStride(nx: number, ny: number, nz: number, budget = 200_000) {
  const cells = nx * ny * nz;
  if (cells <= budget) return 1;
  return Math.max(1, Math.ceil(Math.cbrt(cells / budget)));
}

export function gridPlanCenter(grid: EclipseGrid) {
  const pillars = (grid.nx + 1) * (grid.ny + 1);
  let x = 0;
  let y = 0;
  for (let index = 0; index < pillars; index++) {
    x += grid.coord[index * 6];
    y += grid.coord[index * 6 + 1];
  }
  return [x / pillars, y / pillars] as [number, number];
}

/** Plan positions of the four outer pillar tops: SW, SE, NW, NE. */
export function pillarPlanCorners(grid: EclipseGrid): [number, number][] {
  const { nx, ny } = grid;
  const indexes = [0, nx, ny * (nx + 1), ny * (nx + 1) + nx];
  return indexes.map(index => {
    const at = index * 6;
    return [grid.coord[at], grid.coord[at + 1]];
  });
}
