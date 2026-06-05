/** Entry point: `npm run server` (tsx). PORT / FOG via env. */
import { startCoopServer } from './server';

const port = Number(process.env.PORT) || 8787;
const fog = (process.env.FOG as 'shared' | 'hidden') || 'hidden';
startCoopServer({ port, fog });
console.log(`netcoop server listening on ws://localhost:${port} (fog: ${fog})`);
