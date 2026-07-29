export const copyText = async (text: string) => {
	if (navigator.clipboard?.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return;
		} catch {
			// Fall through when the browser denies Clipboard API access.
		}
	}
	const textArea = document.createElement("textarea");
	textArea.value = text;
	textArea.setAttribute("readonly", "true");
	textArea.style.left = "-9999px";
	textArea.style.position = "fixed";
	textArea.style.top = "0";
	document.body.append(textArea);
	textArea.focus();
	textArea.select();
	const copied = document.execCommand("copy");
	textArea.remove();
	if (!copied) {
		throw new Error("Clipboard access was denied.");
	}
};
