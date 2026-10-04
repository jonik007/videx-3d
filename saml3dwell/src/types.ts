import type { EsriAsciiGrid } from './parsers/esri-ascii';

export type LonLat = [number, number];

export type LicensePolygon = {
  outer: LonLat[];
  holes: LonLat[][];
};

export type LicenseContour = {
  id: string;
  name: string;
  color: string;
  /** Отметка плоскости 2D-контура, м (положительная вверх, МSL). */
  elevation: number;
  visible: boolean;
  polygons: LicensePolygon[];
};

export type Wellhead = {
  id: string;
  name: string;
  longitude: number;
  latitude: number;
  /** Альтитуда / амплитуда ротора, м над уровнем моря. */
  rotaryElevation: number;
  visible: boolean;
};

export type SurfaceLayer = {
  id: string;
  name: string;
  color: string;
  opacity: number;
  visible: boolean;
  /** true: значения сетки — глубина (положительная вниз). */
  depthPositiveDown: boolean;
  wireframe: boolean;
  useColorRamp: boolean;
  grid: EsriAsciiGrid;
};

export const PALETTE = [
  '#1677ff',
  '#13c2c2',
  '#52c41a',
  '#faad14',
  '#eb2f96',
  '#722ed1',
  '#fa541c',
  '#2f54eb',
];

export function paletteColor(index: number) {
  return PALETTE[index % PALETTE.length];
}
