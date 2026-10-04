import { CameraControls, Grid } from '@react-three/drei';
import { Canvas } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef, type RefObject } from 'react';
import { Box3, Group, Vector3 } from 'three';
import { gridExtent } from '../parsers/esri-ascii';
import { useScene } from '../state';
import type { PropertyCube } from '../types';
import { Wgs84Frame } from './Frame';
import { CubeLayer, LicenseLayer, SurfaceLayerMeshes, WellLayer } from './Layers';
import { createSceneCrs, cubePlanLonLat, datasetOrigin } from './project';

function niceStep(span: number) {
  if (!Number.isFinite(span) || span <= 0) return 100;
  const raw = span / 8;
  const power = 10 ** Math.floor(Math.log10(raw));
  const normalized = raw / power;
  const factor =
    normalized < 1.5 ? 1 : normalized < 3.5 ? 2 : normalized < 7.5 ? 5 : 10;
  return factor * power;
}

function horizontalSpan(
  crs: ReturnType<typeof createSceneCrs>['crs'],
  licenses: ReturnType<typeof useScene>['licenses'],
  wells: ReturnType<typeof useScene>['wells'],
  surfaces: ReturnType<typeof useScene>['surfaces'],
  cubes: PropertyCube[],
) {
  const box = new Box3();
  const add = (longitude: number, latitude: number) => {
    const point = crs.wgs84ToWorld(longitude, latitude, 0);
    box.expandByPoint(new Vector3(point.x, 0, point.z));
  };

  for (const license of licenses) {
    for (const polygon of license.polygons) {
      for (const [longitude, latitude] of polygon.outer) add(longitude, latitude);
    }
  }
  for (const well of wells) add(well.longitude, well.latitude);
  for (const surface of surfaces) {
    const extent = gridExtent(surface.grid);
    add(extent.west, extent.south);
    add(extent.east, extent.north);
  }
  for (const cube of cubes) {
    try {
      for (const [longitude, latitude] of cubePlanLonLat(cube)) {
        add(longitude, latitude);
      }
    } catch {
      // Куб с некорректной зоной не входит в размер кадра.
    }
  }

  if (box.isEmpty()) return 1000;
  const size = box.getSize(new Vector3());
  return Math.max(size.x, size.z, 200);
}

function CameraRig({
  signature,
  content,
  focus,
  span,
}: {
  signature: string;
  content: RefObject<Group | null>;
  focus: { x: number; y: number; z: number; nonce: number } | null;
  span: number;
}) {
  const controls = useRef<CameraControls>(null);

  useLayoutEffect(() => {
    const frame = requestAnimationFrame(() => {
      const group = content.current;
      const camera = controls.current;
      if (!group || !camera || !signature) return;
      const box = new Box3().setFromObject(group);
      if (box.isEmpty()) return;
      const size = box.getSize(new Vector3());
      const horizontal = Math.max(size.x, size.z, 1);
      if (size.y < horizontal * 0.12) {
        box.expandByVector(new Vector3(0, horizontal * 0.12, 0));
      }
      void camera.fitToBox(box, true);
    });
    return () => cancelAnimationFrame(frame);
  }, [signature, content]);

  useLayoutEffect(() => {
    if (!focus || !controls.current) return;
    const distance = Math.max(span * 0.28, 350);
    void controls.current.setLookAt(
      focus.x + distance * 0.9,
      focus.y + distance * 0.45,
      focus.z + distance * 0.9,
      focus.x,
      focus.y,
      focus.z,
      true,
    );
  }, [focus, span]);

  return (
    <CameraControls
      ref={controls}
      makeDefault
      maxDistance={1_500_000}
      minDistance={5}
    />
  );
}

function Ground({ span }: { span: number }) {
  const section = niceStep(span);
  const size = Math.max(section * 4, span * 1.6);
  return (
    <Grid
      position={[0, 0, 0]}
      args={[size, size]}
      cellSize={section / 5}
      sectionSize={section}
      cellThickness={0.7}
      sectionThickness={1.5}
      cellColor="#31404d"
      sectionColor="#8ea3b5"
      fadeDistance={size * 0.9}
      fadeStrength={1}
      infiniteGrid={false}
    />
  );
}

export function SceneView() {
  const {
    licenses,
    wells,
    surfaces,
    cubes,
    exaggeration,
    showGrid,
    showVolume,
    focus,
  } = useScene();
  const content = useRef<Group>(null);
  const origin = useMemo(
    () =>
      datasetOrigin(licenses, wells, surfaces, cubes) ??
      ([37.62, 55.75] as [number, number]),
    [licenses, wells, surfaces, cubes],
  );
  const { crs, zone } = useMemo(() => createSceneCrs(origin), [origin]);
  const span = useMemo(
    () => horizontalSpan(crs, licenses, wells, surfaces, cubes),
    [crs, licenses, wells, surfaces, cubes],
  );
  const hasData =
    licenses.length + wells.length + surfaces.length + cubes.length > 0;
  const signature = hasData
    ? [
        licenses
          .map(item => `${item.id}:${item.visible}:${item.elevation}`)
          .join(','),
        wells
          .map(
            item =>
              `${item.id}:${item.visible}:${item.longitude}:${item.latitude}:${item.rotaryElevation}`,
          )
          .join(','),
        surfaces
          .map(item => `${item.id}:${item.visible}:${item.depthPositiveDown}`)
          .join(','),
        cubes
          .map(
            item =>
              `${item.id}:${item.visible}:${item.depthPositiveDown}:${item.coordMode}:${item.utmZone}`,
          )
          .join(','),
        exaggeration,
        showVolume,
      ].join('|')
    : '';

  const focusTarget = useMemo(() => {
    if (!focus) return null;
    const well = wells.find(item => item.id === focus.id);
    if (!well) return null;
    const point = crs.wgs84ToWorld(
      well.longitude,
      well.latitude,
      well.rotaryElevation * exaggeration,
    );
    return {
      x: point.x,
      y: point.y,
      z: point.z,
      nonce: focus.nonce,
    };
  }, [focus, wells, crs, exaggeration]);

  const markerRadius = Math.min(220, Math.max(28, span * 0.011));

  return (
    <div className="scene-shell">
      <Canvas
        style={{ width: '100%', height: '100%', display: 'block' }}
        camera={{
          position: [span, span * 0.7, span],
          fov: 42,
          near: 0.5,
          far: 2_000_000,
        }}
        gl={{ antialias: true, logarithmicDepthBuffer: true }}
        dpr={[1, 2]}
      >
        <color attach="background" args={['#10161c']} />
        <ambientLight intensity={0.72} />
        <hemisphereLight args={['#e7eef5', '#3d342c', 0.4]} />
        <directionalLight position={[4000, 9000, 2500]} intensity={1.7} />
        <Wgs84Frame crs={crs} zone={zone}>
          {showGrid && hasData && <Ground span={span} />}
          <group ref={content}>
            <SurfaceLayerMeshes />
            <CubeLayer />
            <LicenseLayer />
            <WellLayer radius={markerRadius} />
          </group>
        </Wgs84Frame>
        <CameraRig
          signature={signature}
          content={content}
          focus={focusTarget}
          span={span}
        />
      </Canvas>
      <div className="scene-hud">
        <div>WGS84 → UTM {zone}</div>
        <div>Вертикальный масштаб ×{exaggeration}</div>
        <div>X — восток, Y — вверх, север — −Z</div>
      </div>
      {!hasData && (
        <div className="scene-empty">
          Загрузите контуры, устья, поверхность или куб свойств
        </div>
      )}
    </div>
  );
}
