type CliBunRuntime = {
	stdin: {
		text: () => Promise<string>;
	};
	serve: (options: {
		fetch: (request: Request) => Response | Promise<Response>;
		hostname?: string;
		port: number;
	}) => {
		stop: (closeActiveConnections?: boolean) => void;
	};
};

export const bunRuntime = (
	globalThis as typeof globalThis & { Bun: CliBunRuntime }
).Bun;
