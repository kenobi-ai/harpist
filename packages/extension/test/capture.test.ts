import { beforeEach, describe, expect, mock, test } from "bun:test";

type Listener = (...args: unknown[]) => unknown;

const createEvent = () => {
	const listeners = new Set<Listener>();
	return {
		addListener(listener: Listener) {
			listeners.add(listener);
		},
		emit(...args: unknown[]) {
			for (const listener of listeners) {
				listener(...args);
			}
		},
		removeListener(listener: Listener) {
			listeners.delete(listener);
		},
		reset() {
			listeners.clear();
		},
	};
};

const debuggerEvents = createEvent();
const debuggerDetaches = createEvent();
const tabCreatedEvents = createEvent();
const attachedTabIds: number[] = [];
const detachedTabIds: number[] = [];
let responseBodyPromise: Promise<{
	base64Encoded?: boolean;
	body?: string;
}> | null = null;

mock.module("#imports", () => ({
	browser: {
		debugger: {
			attach: async ({ tabId }: { tabId: number }) => {
				attachedTabIds.push(tabId);
			},
			detach: async ({ tabId }: { tabId: number }) => {
				detachedTabIds.push(tabId);
			},
			onDetach: debuggerDetaches,
			onEvent: debuggerEvents,
			sendCommand: async (_target: { tabId: number }, method: string) =>
				method === "Network.getResponseBody" && responseBodyPromise
					? responseBodyPromise
					: {},
		},
		tabs: {
			onCreated: tabCreatedEvents,
		},
	},
}));

const { createCaptureController } = await import("../lib/capture");

const settle = () =>
	new Promise<void>((resolve) => {
		setTimeout(resolve, 0);
	});

beforeEach(() => {
	attachedTabIds.length = 0;
	detachedTabIds.length = 0;
	debuggerEvents.reset();
	debuggerDetaches.reset();
	tabCreatedEvents.reset();
	responseBodyPromise = null;
});

describe("capture controller", () => {
	test("captures the starting tab and descendant tabs only", async () => {
		const controller = createCaptureController();
		await controller.start(1);

		tabCreatedEvents.emit({ id: 2, openerTabId: 1 });
		tabCreatedEvents.emit({ id: 4, openerTabId: 2 });
		tabCreatedEvents.emit({ id: 3, openerTabId: 99 });
		await settle();

		expect(attachedTabIds).toEqual([1, 2, 4]);
		expect(controller.state()).toMatchObject({
			recording: true,
			tabCount: 3,
			tabId: 1,
		});

		debuggerEvents.emit({ tabId: 1 }, "Network.requestWillBeSent", {
			request: {
				method: "GET",
				url: "https://example.com/root",
			},
			requestId: "shared-id",
		});
		debuggerEvents.emit({ tabId: 2 }, "Network.requestWillBeSent", {
			request: {
				method: "GET",
				url: "https://example.com/child",
			},
			requestId: "shared-id",
		});

		const entries = await controller.stop();
		expect(entries.map((entry) => entry.url).sort()).toEqual([
			"https://example.com/child",
			"https://example.com/root",
		]);
		expect(detachedTabIds.sort()).toEqual([1, 2, 4]);
	});

	test("keeps recording when a child closes and saves when Chrome cancels the root", async () => {
		const unexpectedStops: Array<{
			entries: Array<{ url: string }>;
			reason: string;
			rootTabId: number;
		}> = [];
		const controller = createCaptureController({
			onUnexpectedStop: (result) => {
				unexpectedStops.push(result);
			},
		});
		await controller.start(10);
		tabCreatedEvents.emit({ id: 11, openerTabId: 10 });
		await settle();
		debuggerEvents.emit({ tabId: 11 }, "Network.requestWillBeSent", {
			request: {
				method: "GET",
				url: "https://example.com/from-child",
			},
			requestId: "child-request",
		});

		debuggerDetaches.emit({ tabId: 11 }, "target_closed");
		expect(controller.state()).toMatchObject({
			recording: true,
			tabCount: 1,
		});
		expect(unexpectedStops).toHaveLength(0);

		debuggerDetaches.emit({ tabId: 10 }, "canceled_by_user");
		await settle();
		expect(controller.state().recording).toBe(false);
		expect(unexpectedStops).toEqual([
			{
				entries: [
					expect.objectContaining({
						url: "https://example.com/from-child",
					}),
				],
				reason: "canceled_by_user",
				rootTabId: 10,
			},
		]);
	});

	test("reports an empty canceled recording without invoking manual stop twice", async () => {
		const unexpectedStops: Array<{ entries: unknown[]; reason: string }> = [];
		const controller = createCaptureController({
			onUnexpectedStop: (result) => {
				unexpectedStops.push(result);
			},
		});
		await controller.start(20);

		debuggerDetaches.emit({ tabId: 20 }, "canceled_by_user");
		await settle();
		expect(unexpectedStops).toEqual([
			{
				entries: [],
				reason: "canceled_by_user",
				rootTabId: 20,
			},
		]);
		expect(await controller.stop()).toEqual([]);
		expect(unexpectedStops).toHaveLength(1);
	});

	test("waits briefly for an in-flight response body before saving", async () => {
		let resolveBody:
			| ((value: { base64Encoded: boolean; body: string }) => void)
			| undefined;
		responseBodyPromise = new Promise((resolve) => {
			resolveBody = resolve;
		});
		const controller = createCaptureController();
		await controller.start(30);
		debuggerEvents.emit({ tabId: 30 }, "Network.requestWillBeSent", {
			request: {
				method: "GET",
				url: "https://example.com/api/data",
			},
			requestId: "request-with-body",
		});
		debuggerEvents.emit({ tabId: 30 }, "Network.responseReceived", {
			requestId: "request-with-body",
			response: {
				mimeType: "application/json",
				status: 200,
			},
		});
		debuggerEvents.emit({ tabId: 30 }, "Network.loadingFinished", {
			requestId: "request-with-body",
		});

		const stop = controller.stop();
		await settle();
		resolveBody?.({
			base64Encoded: false,
			body: '{"ok":true}',
		});
		const entries = await stop;

		expect(entries[0]).toMatchObject({
			body: '{"ok":true}',
			bodyBase64: false,
		});
	});
});
