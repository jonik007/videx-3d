import type { LicenseContour, LicensePolygon, LonLat, Wellhead } from '../types';
import { paletteColor } from '../types';

export type GeoProperties = Record<string, unknown>;

export type GeoFeature = {
  properties: GeoProperties;
  geometry:
    | { type: 'Point'; coordinates: number[] }
    | { type: 'MultiPoint'; coordinates: number[][] }
    | { type: 'LineString'; coordinates: number[][] }
    | { type: 'MultiLineString'; coordinates: number[][][] }
    | { type: 'Polygon'; coordinates: number[][][] }
    | { type: 'MultiPolygon'; coordinates: number[][][][] };
};

type AxisOrder = 'lonlat' | 'latlon';

const NAME_KEYS = [
  'name',
  'wellname',
  'well',
  'license',
  'licence',
  'название',
  'скважина',
  'скв',
  'лу',
  'uwi',
  'id',
];

const ROTARY_KEYS = [
  'амплитударотора',
  'альтитударотора',
  'rotaryelevation',
  'kbelevation',
  'kellybushingelevation',
  'kb',
  'rt',
  'elevation',
  'alt',
  'z',
];

const LICENSE_ELEVATION_KEYS = [
  'elevation',
  'отметка',
  'z',
  'alt',
  'displayelevation',
];

function normKey(key: string) {
  return key.trim().toLowerCase().replace(/[\s_]+/g, '');
}

function readNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim().replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function propertyNumber(properties: GeoProperties, keys: string[]) {
  const entries = Object.entries(properties);
  for (const key of keys) {
    const found = entries.find(([name]) => normKey(name) === key);
    if (!found) continue;
    const value = readNumber(found[1]);
    if (value !== null) return value;
  }
  return null;
}

function propertyText(properties: GeoProperties, keys: string[]) {
  const entries = Object.entries(properties);
  for (const key of keys) {
    const found = entries.find(([name]) => normKey(name) === key);
    if (!found || found[1] === null || found[1] === undefined) continue;
    const text = String(found[1]).trim();
    if (text) return text;
  }
  return null;
}

function asRecord(value: unknown): GeoProperties {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as GeoProperties;
  }
  return {};
}

function detectAxisOrder(features: { geometry: { coordinates: unknown } }[]) {
  const sample: number[][] = [];
  const visit = (value: unknown) => {
    if (!Array.isArray(value) || sample.length > 40) return;
    if (
      value.length >= 2 &&
      typeof value[0] === 'number' &&
      typeof value[1] === 'number'
    ) {
      sample.push(value as number[]);
      return;
    }
    value.forEach(visit);
  };
  features.forEach(feature => visit(feature.geometry.coordinates));

  const looksLatLon = sample.some(
    ([a, b]) => Math.abs(a) <= 90 && Math.abs(b) > 90 && Math.abs(b) <= 180,
  );
  const looksLonLat = sample.some(
    ([a, b]) => Math.abs(a) > 90 && Math.abs(a) <= 180 && Math.abs(b) <= 90,
  );
  if (looksLatLon && !looksLonLat) return 'latlon' as AxisOrder;
  return 'lonlat' as AxisOrder;
}

function applyAxisOrder(position: number[], order: AxisOrder): number[] | null {
  const first = order === 'lonlat' ? position[0] : position[1];
  const second = order === 'lonlat' ? position[1] : position[0];
  if (!Number.isFinite(first) || !Number.isFinite(second)) return null;
  if (Math.abs(first) > 180 || Math.abs(second) > 90) return null;
  const normalized = [first, second];
  if (position.length > 2 && Number.isFinite(position[2])) {
    normalized.push(position[2]);
  }
  return normalized;
}

function walkPositions(value: unknown, order: AxisOrder): unknown {
  if (!Array.isArray(value)) return value;
  if (typeof value[0] === 'number') {
    return applyAxisOrder(value as number[], order);
  }
  return value.map(item => walkPositions(item, order));
}

export function parseGeoJsonDocument(text: string): {
  features: GeoFeature[];
  axisOrder: AxisOrder;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('Файл не является корректным JSON');
  }
  if (!parsed || typeof parsed !== 'object') {
    throw new Error('Ожидался объект GeoJSON');
  }

  const record = parsed as { type?: string; features?: unknown; geometries?: unknown };
  const rawFeatures: unknown[] = [];
  if (record.type === 'FeatureCollection' && Array.isArray(record.features)) {
    rawFeatures.push(...record.features);
  } else if (record.type === 'Feature') {
    rawFeatures.push(parsed);
  } else if (record.type === 'GeometryCollection' && Array.isArray(record.geometries)) {
    for (const geometry of record.geometries) {
      rawFeatures.push({ type: 'Feature', properties: {}, geometry });
    }
  } else if (typeof record.type === 'string') {
    rawFeatures.push({ type: 'Feature', properties: {}, geometry: parsed });
  } else {
    throw new Error('Ожидался GeoJSON Feature, FeatureCollection или геометрия');
  }

  const loose = rawFeatures.map(item => {
    const feature = asRecord(item);
    const geometry = asRecord(feature.geometry);
    return {
      properties: asRecord(feature.properties),
      geometry: {
        type: String(geometry.type || ''),
        coordinates: geometry.coordinates,
      },
    };
  });

  const axisOrder = detectAxisOrder(loose);
  const features: GeoFeature[] = [];

  for (const feature of loose) {
    const type = feature.geometry.type;
    const coordinates = walkPositions(feature.geometry.coordinates, axisOrder);
    if (type === 'Point' && Array.isArray(coordinates)) {
      features.push({
        properties: feature.properties,
        geometry: { type, coordinates: coordinates as number[] },
      });
    } else if (type === 'MultiPoint' || type === 'LineString') {
      features.push({
        properties: feature.properties,
        geometry: {
          type,
          coordinates: (coordinates as LonLat[]) ?? [],
        },
      });
    } else if (type === 'MultiLineString' || type === 'Polygon') {
      features.push({
        properties: feature.properties,
        geometry: {
          type,
          coordinates: (coordinates as LonLat[][]) ?? [],
        },
      });
    } else if (type === 'MultiPolygon') {
      features.push({
        properties: feature.properties,
        geometry: {
          type,
          coordinates: (coordinates as LonLat[][][]) ?? [],
        },
      });
    }
  }

  return { features, axisOrder };
}

function cleanRing(ring: LonLat[]): LonLat[] {
  const points = ring.filter(
    (point): point is LonLat =>
      Array.isArray(point) &&
      point.length >= 2 &&
      Number.isFinite(point[0]) &&
      Number.isFinite(point[1]),
  );
  if (points.length > 1) {
    const [firstLon, firstLat] = points[0];
    const [lastLon, lastLat] = points[points.length - 1];
    if (firstLon === lastLon && firstLat === lastLat) points.pop();
  }
  return points;
}

function polygonFromRings(rings: LonLat[][]): LicensePolygon | null {
  if (!rings.length) return null;
  const outer = cleanRing(rings[0]);
  if (outer.length < 3) return null;
  const holes = rings
    .slice(1)
    .map(cleanRing)
    .filter(ring => ring.length >= 3);
  return { outer, holes };
}

export function licensesFromFeatures(
  features: GeoFeature[],
  options?: { defaultElevation?: number; startIndex?: number },
): { licenses: LicenseContour[]; warnings: string[] } {
  const warnings: string[] = [];
  const licenses: LicenseContour[] = [];
  let index = options?.startIndex ?? 0;

  features.forEach((feature, featureIndex) => {
    const polygons: LicensePolygon[] = [];
    const geometry = feature.geometry;
    if (geometry.type === 'Polygon') {
      const polygon = polygonFromRings(geometry.coordinates as LonLat[][]);
      if (polygon) polygons.push(polygon);
    } else if (geometry.type === 'MultiPolygon') {
      for (const rings of geometry.coordinates as LonLat[][][]) {
        const polygon = polygonFromRings(rings);
        if (polygon) polygons.push(polygon);
      }
    } else if (geometry.type === 'LineString') {
      const polygon = polygonFromRings([geometry.coordinates as LonLat[]]);
      if (polygon) polygons.push(polygon);
      else warnings.push(`Линия ${featureIndex + 1} короче трёх вершин и пропущена`);
    } else if (geometry.type === 'MultiLineString') {
      for (const line of geometry.coordinates as LonLat[][]) {
        const polygon = polygonFromRings([line]);
        if (polygon) polygons.push(polygon);
      }
    } else {
      return;
    }

    if (!polygons.length) {
      warnings.push(`Объект ${featureIndex + 1} не содержит замкнутого контура`);
      return;
    }

    const name =
      propertyText(feature.properties, NAME_KEYS) ?? `Лицензия ${index + 1}`;
    const elevation =
      propertyNumber(feature.properties, LICENSE_ELEVATION_KEYS) ??
      options?.defaultElevation ??
      0;

    licenses.push({
      id: crypto.randomUUID(),
      name,
      color: paletteColor(index),
      elevation,
      visible: true,
      polygons,
    });
    index += 1;
  });

  return { licenses, warnings };
}

export function wellsFromFeatures(
  features: GeoFeature[],
  options?: { elevationField?: string; startIndex?: number },
): { wells: Wellhead[]; warnings: string[] } {
  const warnings: string[] = [];
  const wells: Wellhead[] = [];
  let index = options?.startIndex ?? 0;
  let missingElevation = 0;
  const field = options?.elevationField
    ? normKey(options.elevationField)
    : null;

  const pushPoint = (
    position: number[] | null,
    properties: GeoProperties,
    featureIndex: number,
  ) => {
    if (!position) {
      warnings.push(`Точка ${featureIndex + 1} без координат пропущена`);
      return;
    }
    const [longitude, latitude] = position;
    if (Math.abs(longitude) > 180 || Math.abs(latitude) > 90) {
      warnings.push(
        `Точка ${featureIndex + 1} вне диапазона WGS84 и пропущена`,
      );
      return;
    }

    let rotary = field
      ? propertyNumber(properties, [field])
      : propertyNumber(properties, ROTARY_KEYS);
    if (rotary === null && position.length > 2 && Number.isFinite(position[2])) {
      rotary = position[2];
    }
    if (rotary === null) {
      rotary = 0;
      missingElevation += 1;
    }

    wells.push({
      id: crypto.randomUUID(),
      name: propertyText(properties, NAME_KEYS) ?? `Скважина ${index + 1}`,
      longitude,
      latitude,
      rotaryElevation: rotary,
      visible: true,
    });
    index += 1;
  };

  features.forEach((feature, featureIndex) => {
    if (feature.geometry.type === 'Point') {
      pushPoint(feature.geometry.coordinates, feature.properties, featureIndex);
    } else if (feature.geometry.type === 'MultiPoint') {
      feature.geometry.coordinates.forEach(position => {
        pushPoint(position, feature.properties, featureIndex);
      });
    }
  });

  if (missingElevation > 0) {
    warnings.push(
      `У ${missingElevation} скв. не найдена амплитуда ротора, подставлено 0 м. Ожидается поле амплитуда_ротора, альтитуда_ротора, kb или z`,
    );
  }

  return { wells, warnings };
}

export function numericPropertyNames(features: GeoFeature[]) {
  const names = new Set<string>();
  for (const feature of features) {
    for (const [key, value] of Object.entries(feature.properties)) {
      if (readNumber(value) !== null) names.add(key);
    }
  }
  return [...names];
}
