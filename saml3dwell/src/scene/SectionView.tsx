import { CameraControls, Html, Line } from '@react-three/drei';
import { Canvas, useThree } from '@react-three/fiber';
import CameraControlsImpl from 'camera-controls';
import { useEffect, useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import {
  Box3,
  BufferAttribute,
  BufferGeometry,
  DoubleSide,
  Float32BufferAttribute,
  Group,
  NoToneMapping,
  Vector3,
} from 'three';
import { CRS } from '../../../src/sdk/projection/crs';
import { useScene } from '../state';
import type { PropertyCube } from '../types';
import {
  buildStations,
  cubeBands,
  sectionStep,
  surfaceTraces,
  type CubeBand,
  type SectionAnchor,
  type WellMark,
} from './section';

type DrawnSurface = {
  id: string;
  color: string;
  lines: { s: number; elevation: number }[][];
};

type DrawnCube = {
  id: string;
  opacity: number;
  bands: CubeBand[];
};
import { createSceneCrs, datasetOrigin, wgs84UtmDef } from './project';

function cubePlan(cube: PropertyCube, longitude: number, latitude: number) {
  if (cube.coordMode === 'wgs84') return [longitude, latitude] as [number, number];
  const crs = new CRS(wgs84UtmDef(cube.utmZone), [0, 0], 'utm');
  return crs.wgs84ToUtm([longitude, latitude]);
}

function formatDistance(meters: number) {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} км`;
  return `${Math.round(meters)} м`;
}

function bandsGeometry(bands: CubeBand[], exaggeration: number) {
  if (!bands.length) return null;
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  for (const band of bands) {
    const base = positions.length / 3;
    const yTop0 = band.top * exaggeration;
    const yTop1 = band.top * exaggeration;
    const yBottom0 = band.bottom * exaggeration;
    const yBottom1 = band.bottom * exaggeration;
    positions.push(
      band.s0, yTop0, 0,
      band.s1, yTop1, 0,
      band.s1, yBottom1, 0,
      band.s0, yBottom0, 0,
    );
    for (let corner = 0; corner < 4; corner++) colors.push(...band.color);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new Float32BufferAttribute(colors, 3));
  geometry.setIndex(new BufferAttribute(new Uint32Array(indices), 1));
  return geometry;
}

function SectionMesh({
  surfaces,
  cubes,
  wells,
  exaggeration,
}: {
  surfaces: DrawnSurface[];
  cubes: DrawnCube[];
  wells: WellMark[];
  exaggeration: number;
}) {
  const geometries = useMemo(
    () =>
      cubes.map(cube => ({
        id: cube.id,
        opacity: cube.opacity,
        geometry: bandsGeometry(cube.bands, exaggeration),
      })),
    [cubes, exaggeration],
  );

  useEffect(() => {
    return () => {
      geometries.forEach(item => item.geometry?.dispose());
    };
  }, [geometries]);

  const foot = useMemo(() => {
    let min = Infinity;
    for (const cube of cubes) {
      for (const band of cube.bands) min = Math.min(min, band.bottom);
    }
    for (const surface of surfaces) {
      for (const line of surface.lines) {
        for (const point of line) min = Math.min(min, point.elevation);
      }
    }
    if (!Number.isFinite(min)) {
      min = Math.min(...wells.map(well => well.rotaryElevation), 0) - 400;
    }
    return min;
  }, [cubes, surfaces, wells]);

  return (
    <group>
      {geometries.map(item =>
        item.geometry ? (
          <mesh key={item.id} geometry={item.geometry}>
            <meshBasicMaterial
              vertexColors
              side={DoubleSide}
              transparent={item.opacity < 0.999}
              opacity={item.opacity}
              depthWrite={item.opacity > 0.9}
            />
          </mesh>
        ) : null,
      )}
      {surfaces.map(surface =>
        surface.lines.map((line, index) => (
          <Line
            key={`${surface.id}-${index}`}
            points={line.map(point => [
              point.s,
              point.elevation * exaggeration,
              2,
            ])}
            color={surface.color}
            lineWidth={3}
          />
        )),
      )}
      {wells.map(well => {
        const top = well.rotaryElevation * exaggeration;
        const bottom = foot * exaggeration;
        return (
          <group key={well.id}>
            <Line
              points={[
                [well.s, top, 3],
                [well.s, bottom, 3],
              ]}
              color="#ff4d4f"
              lineWidth={2}
            />
            <Html position={[well.s, top, 3]} center style={{ pointerEvents: 'none' }}>
              <div className="well-label">
                <b>{well.name}</b>
                <span>{formatDistance(well.s)}</span>
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

function SideCamera({
  signature,
  content,
}: {
  signature: string;
  content: RefObject<Group | null>;
}) {
  const controls = useRef<CameraControlsImpl>(null);
  const size = useThree(state => state.size);

  useLayoutEffect(() => {
    const group = content.current;
    const camera = controls.current;
    if (!group || !camera || !signature) return;
    const box = new Box3().setFromObject(group);
    if (box.isEmpty()) return;
    const center = box.getCenter(new Vector3());
    const span = box.getSize(new Vector3());
    const distance = Math.max(span.x, span.y, 1);
    const { ACTION } = CameraControlsImpl;
    camera.mouseButtons.left = ACTION.TRUCK;
    camera.mouseButtons.right = ACTION.TRUCK;
    camera.mouseButtons.wheel = ACTION.DOLLY;
    camera.mouseButtons.middle = ACTION.DOLLY;
    camera.touches.one = ACTION.TOUCH_TRUCK;
    camera.touches.two = ACTION.TOUCH_DOLLY;
    void camera
      .setLookAt(
        center.x,
        center.y,
        center.z + distance,
        center.x,
        center.y,
        center.z,
        false,
      )
      .then(() =>
        camera.fitToBox(box, false, {
          paddingTop: 48,
          paddingBottom: 36,
          paddingLeft: 48,
          paddingRight: 24,
        }),
      );
  }, [signature, content, size.width, size.height]);

  return <CameraControls ref={controls} makeDefault />;
}

export function SectionCanvas({ wellIds }: { wellIds: string[] }) {
  const { licenses, wells, surfaces, cubes, exaggeration } = useScene();
  const content = useRef<Group>(null);
  const selected = useMemo(
    () =>
      wellIds.flatMap(id => {
        const well = wells.find(item => item.id === id);
        return well ? [well] : [];
      }),
    [wellIds, wells],
  );
  const origin = useMemo(
    () =>
      datasetOrigin(licenses, wells, surfaces, cubes) ??
      ([37.62, 55.75] as [number, number]),
    [licenses, wells, surfaces, cubes],
  );
  const { crs } = useMemo(() => createSceneCrs(origin), [origin]);

  const model = useMemo(() => {
    const anchors: SectionAnchor[] = selected.map(well => {
      const world = crs.wgs84ToWorld(well.longitude, well.latitude, 0);
      return {
        id: well.id,
        name: well.name,
        longitude: well.longitude,
        latitude: well.latitude,
        rotaryElevation: well.rotaryElevation,
        x: world.x,
        z: world.z,
      };
    });
    let length = 0;
    for (let index = 1; index < anchors.length; index++) {
      length += Math.hypot(
        anchors[index].x - anchors[index - 1].x,
        anchors[index].z - anchors[index - 1].z,
      );
    }
    const path = buildStations(anchors, sectionStep(length), (x, z) => {
      const geographic = crs.worldToWgs84(x, 0, z);
      return { longitude: geographic.lng, latitude: geographic.lat };
    });
    const visibleSurfaces = surfaces
      .filter(surface => surface.visible)
      .map(surface => ({
        id: surface.id,
        color: surface.color,
        lines: surfaceTraces(
          path.stations,
          surface.grid,
          surface.depthPositiveDown,
        ),
      }));
    const visibleCubes = cubes
      .filter(cube => cube.visible)
      .flatMap(cube => {
        let plan: (longitude: number, latitude: number) => [number, number];
        try {
          plan = (longitude, latitude) => cubePlan(cube, longitude, latitude);
        } catch {
          return [];
        }
        return [
          {
            id: cube.id,
            opacity: cube.opacity,
            bands: cubeBands(path.stations, cube, plan),
          },
        ];
      });
    return {
      wells: path.wells,
      surfaces: visibleSurfaces,
      cubes: visibleCubes,
    };
  }, [crs, cubes, selected, surfaces]);

  const signature = [
    selected.map(well => well.id).join(','),
    exaggeration,
    model.surfaces.map(surface => surface.id).join(','),
    model.cubes
      .map(cube => `${cube.id}:${cube.bands.length}:${cube.opacity}`)
      .join(','),
  ].join('|');
  const hasSection = selected.length > 0;

  return (
    <div className="section-stage">
      {hasSection && (
        <Canvas
          orthographic
          style={{ width: '100%', height: '100%', display: 'block' }}
          camera={{ position: [0, 0, 8000], zoom: 0.15, near: 0.1, far: 200000 }}
          gl={{ antialias: true, toneMapping: NoToneMapping }}
        >
          <color attach="background" args={['#10161c']} />
          <group ref={content}>
            <SectionMesh
              surfaces={model.surfaces}
              cubes={model.cubes}
              wells={model.wells}
              exaggeration={exaggeration}
            />
          </group>
          <SideCamera signature={signature} content={content} />
        </Canvas>
      )}
      {hasSection && (
        <div className="scene-hud">
          <div>Вид сбоку по выбранным скважинам</div>
          <div>По горизонтали — расстояние, м</div>
          <div>По вертикали — отметка ×{exaggeration}</div>
        </div>
      )}
      {!hasSection && (
        <div className="scene-empty">Выберите скважины — разрез пойдёт по порядку выбора</div>
      )}
    </div>
  );
}
