import { useEffect } from 'react';
import { useAppStore } from './state/appStore';
import { MainMenu } from './ui/screens/MainMenu';
import { SkirmishSetup } from './ui/screens/SkirmishSetup';
import { LobbyScreen } from './ui/screens/LobbyScreen';
import { BattleScreen } from './ui/screens/BattleScreen';
import { SettingsScreen } from './ui/screens/SettingsScreen';
import { ErrorBoundary } from './ui/components/ErrorBoundary';

function ScreenRouter() {
  const screen = useAppStore((s) => s.screen);
  switch (screen) {
    case 'skirmish':
      return <SkirmishSetup />;
    case 'lobby':
      return <LobbyScreen />;
    case 'game':
      return <BattleScreen />;
    case 'settings':
      return <SettingsScreen />;
    case 'menu':
    default:
      return <MainMenu />;
  }
}

export default function App() {
  // Reflect the scanline setting on the body overlay.
  const showScanlines = useAppStore((s) => s.settings.showScanlines);

  useEffect(() => {
    document.body.classList.toggle('no-scanlines', !showScanlines);
  }, [showScanlines]);

  // Dev convenience: jump straight to a screen via ?screen=game|lobby|settings|skirmish
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const target = params.get('screen');
    const valid = ['menu', 'skirmish', 'lobby', 'game', 'settings'];
    if (target && valid.includes(target)) {
      useAppStore.getState().go(target as never);
    }
  }, []);

  return (
    <div className="h-full w-full">
      <ErrorBoundary
        onReset={() => {
          // A crashed battle screen can't be recovered in place; send the
          // player back to the menu where they can start a fresh match.
          useAppStore.getState().go('menu');
        }}
      >
        <ScreenRouter />
      </ErrorBoundary>
    </div>
  );
}