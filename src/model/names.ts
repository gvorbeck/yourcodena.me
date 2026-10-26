/** How an Agent is listed everywhere (game page, roll log, Discord): codename first, then name. Kept tiny so the game page and Functions can share it. */
export const agentLabel = (codename?: unknown, name?: unknown) => String(codename ?? '').trim() || String(name ?? '').trim() || 'Unnamed agent';
