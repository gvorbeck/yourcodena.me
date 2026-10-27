// Where things live, in one place: Firestore document paths (shared with the Functions; layout in games.ts) and page URLs.
export const gamePath = (g: string) => `games/${g}`;
export const agentsPath = (g: string) => `games/${g}/agents`;
export const agentPath = (g: string, a: string) => `${agentsPath(g)}/${a}`;
export const rollsPath = (g: string) => `games/${g}/rolls`;

export const gameUrl = (g: string) => `/g/${g}`;
export const agentUrl = (g: string, a: string) => `${gameUrl(g)}/a/${a}`;
