import { useMemo } from 'react';
import { LiveSheet } from '../LiveSheet';
import { decodeSheet } from '../model/live';
import Home from './Home';

/** A sheet shared by an old `/#sheet=…` link: standalone, kept in the URL, no game or database. */
export default function Shared({ hash }: { hash: string }) {
  const shared = useMemo(() => decodeSheet(hash), [hash]);
  return shared ? <LiveSheet key={hash} c={shared.c} init={shared.l} /> : <Home />;
}
