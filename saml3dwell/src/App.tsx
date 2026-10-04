import { App as AntApp, ConfigProvider, Grid } from 'antd';
import ruRU from 'antd/locale/ru_RU';
import { Sidebar } from './panels/Sidebar';
import { SceneView } from './scene/SceneView';
import { SceneProvider } from './state';

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
          <SceneView />
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
