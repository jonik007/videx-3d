import { App as AntApp, ConfigProvider, Grid, Select, Tabs, Typography } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { useEffect, useState } from 'react';
import { Sidebar } from './panels/Sidebar';
import { SceneView } from './scene/SceneView';
import { SectionCanvas } from './scene/SectionView';
import { SceneProvider, useScene } from './state';

function ViewShell() {
  const { wells } = useScene();
  const [tab, setTab] = useState<'scene' | 'section'>('scene');
  const [sectionWellIds, setSectionWellIds] = useState<string[]>([]);

  useEffect(() => {
    setSectionWellIds(current =>
      current.filter(id => wells.some(well => well.id === id)),
    );
  }, [wells]);

  const order = sectionWellIds.flatMap(id => {
    const well = wells.find(item => item.id === id);
    return well ? [well.name] : [];
  });

  return (
    <div className="view-shell">
      <Tabs
        className="view-tabs"
        activeKey={tab}
        onChange={key => setTab(key as 'scene' | 'section')}
        items={[
          { key: 'scene', label: 'Сцена' },
          { key: 'section', label: 'Разрез' },
        ]}
      />
      {tab === 'section' && (
        <div className="section-bar">
          <Select
            mode="multiple"
            allowClear
            placeholder="Выберите скважины по порядку"
            value={sectionWellIds}
            style={{ minWidth: 260, flex: 1 }}
            options={wells.map(well => ({ value: well.id, label: well.name }))}
            onChange={(next: string[]) => {
              setSectionWellIds(current => {
                const kept = current.filter(id => next.includes(id));
                const added = next.filter(id => !current.includes(id));
                return [...kept, ...added];
              });
            }}
            disabled={!wells.length}
          />
          <Typography.Text type="secondary">
            {order.length
              ? `Линия разреза: ${order.join(' → ')}`
              : 'Сначала загрузите устья и выберите скважины'}
          </Typography.Text>
        </div>
      )}
      <div className="view-stage">
        <div className={tab === 'scene' ? 'view-pane' : 'view-pane is-hidden'}>
          <SceneView />
        </div>
        <div className={tab === 'section' ? 'view-pane' : 'view-pane is-hidden'}>
          <SectionCanvas wellIds={sectionWellIds} />
        </div>
      </div>
    </div>
  );
}

function Shell() {
  const screens = Grid.useBreakpoint();
  const stacked = screens.lg === false;

  return (
    <div className="app-shell">
      <header className="app-header">
        <span className="app-title">saml3dwell</span>
        <span className="app-subtitle">
          Лицензии, устья, поверхности и кубы · WGS84
        </span>
      </header>
      <div className={stacked ? 'app-body stacked' : 'app-body'}>
        <aside className="side-panel">
          <Sidebar />
        </aside>
        <main className="scene-pane">
          <ViewShell />
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ConfigProvider
      locale={ruRU}
      theme={{
        token: {
          colorPrimary: '#0b4f6c',
          borderRadius: 6,
        },
      }}
    >
      <AntApp>
        <SceneProvider>
          <Shell />
        </SceneProvider>
      </AntApp>
    </ConfigProvider>
  );
}
