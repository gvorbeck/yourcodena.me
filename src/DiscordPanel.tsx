import { useEffect, useId, useState, type FormEvent } from 'react';
import { Win } from './ui/Win';
import { discordError, discordWebhook, type DiscordStatus } from './lib/discord';

/**
 * Game page panel, collapsed until its title is clicked: connect a Discord webhook so the game's rolls post to a channel.
 * The title shows CONNECTED when one is set. The URL never comes back from the server.
 */
export function DiscordPanel({ gameId }: { gameId: string }) {
  const id = useId();
  const [status, setStatus] = useState<DiscordStatus | 'error' | null>(null);
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');

  useEffect(() => {
    let live = true;
    setStatus(null);
    discordWebhook(gameId).then((s) => live && setStatus(s), () => live && setStatus('error'));
    return () => { live = false; };
  }, [gameId]);

  const save = async (next: string) => {
    setBusy(true); setErr(''); setNote('');
    try {
      const s = await discordWebhook(gameId, next);
      setStatus(s); setUrl('');
      setNote(s.connected ? 'Connected. Check the channel for a test message.' : 'Disconnected. Rolls no longer post to Discord.');
    } catch (e) { setErr(discordError(e)); }
    setBusy(false);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (url.trim()) save(url.trim()); };
  const connected = typeof status === 'object' && status?.connected;

  return (
    <Win title="DISCORD" collapsible right={connected && <span className="badge-ok">CONNECTED</span>}>
      {status === null ? <p className="dim" role="status">Checking…</p>
        : status === 'error' ? <p className="warn">Couldn't check the Discord connection. Reload to retry.</p>
        : connected ? (
          <div className="row">
            <span>Rolls post to Discord as <b>{status.name || 'your webhook'}</b>.</span>
            <button className="btn" onClick={() => save('')} disabled={busy}>Disconnect</button>
          </div>
        ) : <p className="dim">Post this game's rolls to a Discord channel.</p>}
      {status !== null && status !== 'error' && (
        <form className="row" onSubmit={submit}>
          <label htmlFor={id}>{connected ? 'New webhook URL' : 'Webhook URL'}</label>
          <input id={id} type="text" inputMode="url" autoComplete="off" spellCheck={false} value={url} onChange={(e) => setUrl(e.target.value)} disabled={busy} />
          <button className="btn" type="submit" disabled={busy || !url.trim()}>{busy ? 'Checking…' : 'Connect'}</button>
        </form>
      )}
      <p className="dim"><small>In Discord: channel settings → Integrations → Webhooks → New Webhook → Copy Webhook URL. It's stored on the server and never shown here again. Anyone with the game link can change it.</small></p>
      <p className="ok" role="status">{note}</p>
      {err && <p className="warn" role="alert">{err}</p>}
    </Win>
  );
}
