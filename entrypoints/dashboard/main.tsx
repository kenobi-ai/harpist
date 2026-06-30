import React from "react";
import ReactDOM from "react-dom/client";
import Dashboard from "./Dashboard.tsx";

const root = document.getElementById("root");

if (!root) {
	throw new Error("Missing dashboard root element.");
}

ReactDOM.createRoot(root).render(
	<React.StrictMode>
		<Dashboard />
	</React.StrictMode>,
);
