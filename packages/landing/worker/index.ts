export default {
	fetch(request) {
		const url = new URL(request.url);

		if (url.pathname === "/api/health") {
			return Response.json({
				name: "harpist-landing",
				ok: true,
			});
		}

		return new Response(null, { status: 404 });
	},
} satisfies ExportedHandler;
