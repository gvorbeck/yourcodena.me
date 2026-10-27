import { lazy, Suspense, useEffect, useState } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './ErrorBoundary';
import { Loading } from './ui/bits';

// Each page is its own chunk, so the landing page doesn't download the sheet editor (and react-aria) it never shows.
const Home = lazy(() => import('./pages/Home'));
const Game = lazy(() => import('./pages/Game'));
const Agent = lazy(() => import('./pages/Agent'));
const Shared = lazy(() => import('./pages/Shared'));

const useHash = () => {
  const [hash, setHash] = useState(location.hash);
  // Only hashchange updates it: replaceState edits fire none, so a live sheet saving to its URL never remounts.
  useEffect(() => { const h = () => setHash(location.hash); addEventListener('hashchange', h); return () => removeEventListener('hashchange', h); }, []);
  return hash;
};

const Root = () => {
  const hash = useHash();
  return hash.startsWith('#sheet=') ? <Shared hash={hash} /> : <Home />;
};

export const App = () => {
  const { pathname } = useLocation();
  return (
    <ErrorBoundary key={pathname}>
      <Suspense fallback={<Loading className="dim page" />}>
        <Routes>
          <Route path="/" element={<Root />} />
          <Route path="/g/:gameId" element={<Game />} />
          <Route path="/g/:gameId/a/:agentId" element={<Agent />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
};
