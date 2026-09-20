import { StrictMode } from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import SettingsWindow from './components/SettingsWindow';
import { parseRenderMode } from './utils/launchMode';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Could not find root element to mount to');
}

// Both windows load this same entry; the query string decides which tree runs.
// The branch belongs here rather than inside App, because App unconditionally
// opens the OSC bridge and the IME IPC - a second copy of those would fight
// the first.
// 両方のウィンドウがこの同じエントリを読み込み、どちらのツリーを動かすかは
// クエリ文字列が決める。この分岐が App の内側ではなくここにあるのは、App が
// 無条件に OSC ブリッジと IME IPC を開くためである。2つ目のコピーは1つ目と
// 衝突してしまう。
const renderMode = parseRenderMode(window.location.search);

const root = ReactDOM.createRoot(rootElement);
root.render(
  <StrictMode>
    {renderMode === 'settings' ? <SettingsWindow /> : <App />}
  </StrictMode>,
);
