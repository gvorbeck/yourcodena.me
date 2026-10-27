import { useId, useState, type FormEvent } from 'react';
import { Win } from './ui/Win';
import { Alert } from './ui/bits';
import { useLoad } from './lib/useSub';
import { useRun } from './lib/useRun';
import { discordError, discordWebhook, type DiscordStatus } from './lib/discord';

/**
 * Game page panel, collapsed until its title is clicked: connect a Discord webhook so the game's rolls post to a channel.
 * The title shows CONNECTED when one is set. The URL never comes back from the server.
 */
export function DiscordPanel({ gameId }: { gameId: string }) {
  const id = useId();
  const loaded = useLoad(gameId, (g) => discordWebhook(g));
  const [saved, setSaved] = useState<{ gameId: string; s: DiscordStatus } | null>(null);
  const status = saved?.gameId === gameId ? saved.s : loaded.data; // undefined while checking
  const [url, setUrl] = useState('');
  const [note, setNote] = useState('');
  const { busy, err, run } = useRun(discordError);

  const save = (next: string) => run(async () => {
    setNote('');
    const s = await discordWebhook(gameId, next);
    setSaved({ gameId, s }); setUrl('');
    setNote(s.connected ? 'Connected. Check the channel for a test message.' : 'Disconnected. Rolls no longer post to Discord.');
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (url.trim()) save(url.trim()); };
  const connected = status?.connected;

  return (
    <Win title="DISCORD" collapsible right={connected && <span className="badge-ok">CONNECTED</span>}>
      {status ? (connected ? (
          <div className="row">
            <span>Rolls post to Discord as <b>{status.name || 'your webhook'}</b>.</span>
            <button className="btn" onClick={() => save('')} disabled={busy}>Disconnect</button>
          </div>
        ) : <p className="dim">Post this game's rolls to a Discord channel.</p>)
        : loaded.error ? <p className="warn">Couldn't check the Discord connection. Reload to retry.</p>
        : <p className="dim" role="status">Checking…</p>}
      {status && (
        <form className="row" onSubmit={submit}>
          <label htmlFor={id}>{connected ? 'New webhook URL' : 'Webhook URL'}</label>
          <input id={id} type="text" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
          <button className="btn" type="submit" disabled={busy || !url.trim()}>{busy ? 'Checking…' : 'Connect'}</button>
        </form>
      )}
      <p className="dim"><small>In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. It's stored on the server and never shown here again. Anyone with the game link can change it.</small></p>
      <p className="ok" role="status">{note}</p>
      <Alert>{err}</Alert>
    </Win>
  );
}
