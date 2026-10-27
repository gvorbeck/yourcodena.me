// Where things live, in one place: Firestore document paths (shared with the Functions; layout in games.ts) and page URLs.
export const gamePath = (g: string) => `games/${g}`;
export const agentsPath = (g: string) => `games/${g}/agents`;
export const agentPath = (g: string, a: string) => `${agentsPath(g)}/${a}`;
export const rollsPath = (g: string) => `games/${g}/rolls`;
/** The game's Discord webhook (Functions only; the rules deny browsers). */
export const secretPath = (g: string) => `gameSecrets/${g}`;

export const gameUrl = (g: string) => `/g/${g}`;
export const agentUrl = (g: string, a: string) => `${gameUrl(g)}/a/${a}`;
