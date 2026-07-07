const extensionIdPattern = /^[a-z0-9-]{8,64}$/i;

const safeExtensionId = (extensionId?: string | null) =>
	extensionId && extensionIdPattern.test(extensionId) ? extensionId : null;

/**
 * A tiny page the CLI opens to wake the Harpist extension. Pages served
 * from 127.0.0.1 are declared in the extension's externally_connectable,
 * so chrome.runtime.sendMessage can spin up the service worker — the only
 * push channel MV3 offers a local process. The extension closes this tab
 * itself once it has claimed the pending commands.
 */
export const wakePage = (extensionId?: string | null) => {
	const id = safeExtensionId(extensionId);
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>Harpist</title>
<style>
	body { align-items: center; background: #0b0b0f; color: #e7e7ea; display: flex; font: 15px/1.5 ui-sans-serif, system-ui; height: 100vh; justify-content: center; margin: 0; }
	main { max-width: 26rem; padding: 1rem; text-align: center; }
	p { color: #9a9aa3; }
</style>
</head>
<body>
<main>
	<h1>Harpist</h1>
	<p id="status">Waking the Harpist extension…</p>
</main>
<script>
	const extensionId = ${JSON.stringify(id)};
	const status = (message) => {
		document.getElementById("status").textContent = message;
	};
	if (!extensionId) {
		status("The Harpist extension has not synced with this bridge yet. Falling back to the regular login flow — you can close this tab.");
	} else if (typeof chrome === "undefined" || !chrome.runtime || !chrome.runtime.sendMessage) {
		status("This browser cannot wake the Harpist extension. You can close this tab.");
	} else {
		chrome.runtime.sendMessage(extensionId, { type: "PULL_COMMANDS" }, () => {
			if (chrome.runtime.lastError) {
				status("Could not reach the Harpist extension. You can close this tab.");
			} else {
				status("Harpist is opening your login page — this tab will close itself.");
			}
		});
	}
</script>
</body>
</html>`;
};
