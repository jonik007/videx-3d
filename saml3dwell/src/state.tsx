import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { parseEsriAsciiGrid } from './parsers/esri-ascii';
import {
  licensesFromFeatures,
  parseGeoJsonDocument,
  wellsFromFeatures,
} from './parsers/geojson';
import type { LicenseContour, SurfaceLayer, Wellhead } from './types';

export type SceneFocus = {
  id: string;
  nonce: number;
};

type SceneState = {
  licenses: LicenseContour[];
  wells: Wellhead[];
  surfaces: SurfaceLayer[];
  exaggeration: number;
  showVolume: boolean;
  showGrid: boolean;
  showLabels: boolean;
  focus: SceneFocus | null;
  addLicenses: (items: LicenseContour[]) => void;
  addWells: (items: Wellhead[]) => void;
  addSurface: (item: SurfaceLayer) => void;
  updateLicense: (id: string, patch: Partial<LicenseContour>) => void;
  updateWell: (id: string, patch: Partial<Wellhead>) => void;
  updateSurface: (id: string, patch: Partial<SurfaceLayer>) => void;
  removeLicense: (id: string) => void;
  removeWell: (id: string) => void;
  removeSurface: (id: string) => void;
  setExaggeration: (value: number) => void;
  setShowVolume: (value: boolean) => void;
  setShowGrid: (value: boolean) => void;
  setShowLabels: (value: boolean) => void;
  focusWell: (id: string) => void;
  clearAll: () => void;
  loadSample: () => Promise<string[]>;
};

const SceneContext = createContext<SceneState | null>(null);

async function readSample(path: string) {
  const response = await fetch(path);
  if (!response.ok) {
    throw new Error(`Не удалось загрузить ${path}`);
  }
  return response.text();
}

export function SceneProvider({ children }: { children: ReactNode }) {
  const [licenses, setLicenses] = useState<LicenseContour[]>([]);
  const [wells, setWells] = useState<Wellhead[]>([]);
  const [surfaces, setSurfaces] = useState<SurfaceLayer[]>([]);
  const [exaggeration, setExaggeration] = useState(6);
  const [showVolume, setShowVolume] = useState(true);
  const [showGrid, setShowGrid] = useState(true);
  const [showLabels, setShowLabels] = useState(true);
  const [focus, setFocus] = useState<SceneFocus | null>(null);

  const addLicenses = useCallback((items: LicenseContour[]) => {
    setLicenses(current => [...current, ...items]);
  }, []);
  const addWells = useCallback((items: Wellhead[]) => {
    setWells(current => [...current, ...items]);
  }, []);
  const addSurface = useCallback((item: SurfaceLayer) => {
    setSurfaces(current => [...current, item]);
  }, []);
  const updateLicense = useCallback(
    (id: string, patch: Partial<LicenseContour>) => {
      setLicenses(current =>
        current.map(item => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );
  const updateWell = useCallback((id: string, patch: Partial<Wellhead>) => {
    setWells(current =>
      current.map(item => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);
  const updateSurface = useCallback(
    (id: string, patch: Partial<SurfaceLayer>) => {
      setSurfaces(current =>
        current.map(item => (item.id === id ? { ...item, ...patch } : item)),
      );
    },
    [],
  );
  const removeLicense = useCallback((id: string) => {
    setLicenses(current => current.filter(item => item.id !== id));
  }, []);
  const removeWell = useCallback((id: string) => {
    setWells(current => current.filter(item => item.id !== id));
  }, []);
  const removeSurface = useCallback((id: string) => {
    setSurfaces(current => current.filter(item => item.id !== id));
  }, []);
  const focusWell = useCallback((id: string) => {
    setFocus({ id, nonce: Date.now() });
  }, []);
  const clearAll = useCallback(() => {
    setLicenses([]);
    setWells([]);
    setSurfaces([]);
    setFocus(null);
  }, []);

  const loadSample = useCallback(async () => {
    const [licenseText, wellText, surfaceText] = await Promise.all([
      readSample('/samples/licenses.geojson'),
      readSample('/samples/wellheads.geojson'),
      readSample('/samples/horizon.asc'),
    ]);
    const licenseDoc = parseGeoJsonDocument(licenseText);
    const wellDoc = parseGeoJsonDocument(wellText);
    const grid = parseEsriAsciiGrid(surfaceText);
    const { licenses: nextLicenses, warnings: licenseWarnings } =
      licensesFromFeatures(licenseDoc.features);
    const { wells: nextWells, warnings: wellWarnings } = wellsFromFeatures(
      wellDoc.features,
    );
    setLicenses(nextLicenses);
    setWells(nextWells);
    setSurfaces([
      {
        id: crypto.randomUUID(),
        name: 'Горизонт B',
        color: '#d4a574',
        opacity: 0.95,
        visible: true,
        depthPositiveDown: false,
        wireframe: false,
        useColorRamp: true,
        grid,
      },
    ]);
    setFocus(null);
    return [...licenseWarnings, ...wellWarnings];
  }, []);

  const value = useMemo<SceneState>(
    () => ({
      licenses,
      wells,
      surfaces,
      exaggeration,
      showVolume,
      showGrid,
      showLabels,
      focus,
      addLicenses,
      addWells,
      addSurface,
      updateLicense,
      updateWell,
      updateSurface,
      removeLicense,
      removeWell,
      removeSurface,
      setExaggeration,
      setShowVolume,
      setShowGrid,
      setShowLabels,
      focusWell,
      clearAll,
      loadSample,
    }),
    [
      licenses,
      wells,
      surfaces,
      exaggeration,
      showVolume,
      showGrid,
      showLabels,
      focus,
      addLicenses,
      addWells,
      addSurface,
      updateLicense,
      updateWell,
      updateSurface,
      removeLicense,
      removeWell,
      removeSurface,
      focusWell,
      clearAll,
      loadSample,
    ],
  );

  return (
    <SceneContext.Provider value={value}>{children}</SceneContext.Provider>
  );
}

export function useScene() {
  const value = useContext(SceneContext);
  if (!value) {
    throw new Error('useScene должен вызываться внутри SceneProvider');
  }
  return value;
}
