import React from "react";
import ReactDom from "react-dom/client";
import App from "./App.tsx";

const root = document.getElementById("root");
if (!root) {
	throw new Error("Missing root element.");
}

ReactDom.createRoot(root).render(
	<React.StrictMode>
		<App />
	</React.StrictMode>,
);
