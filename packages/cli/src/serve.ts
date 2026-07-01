import { join } from "node:path";
import { createHarpistBridgeServer } from "./server";
import { createBridgeStore } from "./store";

declare const Bun: {
	serve: (options: {
		fetch: (request: Request) => Response | Promise<Response>;
		hostname?: string;
		port: number;
	}) => void;
};

const port = Number(process.env.HARPIST_PORT ?? 4277);
const hostname = process.env.HARPIST_HOST ?? "127.0.0.1";
const workingDirectory = process.env.INIT_CWD ?? process.cwd();
const dataDir =
	process.env.HARPIST_DATA_DIR ?? join(workingDirectory, ".harpist-data");
const bridgeUrl = `http://${hostname}:${port}`;
const store = createBridgeStore(dataDir);
const app = createHarpistBridgeServer({
	bridgeUrl,
	store,
});

Bun.serve({
	fetch: app.fetch,
	hostname,
	port,
});

console.log(`Harpist Bridge listening on ${bridgeUrl}`);
console.log(`   data dir: ${dataDir}`);
console.log(`   docs:     ${bridgeUrl}/openapi`);
