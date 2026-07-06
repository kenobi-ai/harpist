import { ExternalLink } from "./ExternalLink";

export function PrivacyPolicyPage() {
	return (
		<main className="min-h-screen bg-stone-300 font-sans text-stone-900 antialiased">
			<section className="min-h-screen">
				<div className="mx-auto max-w-4xl px-5 py-3">
					<header className="flex items-center justify-between gap-3 border-stone-900/25 border-b py-2 text-xs">
						<a className="font-bold" href="/">
							harpist
						</a>
						<a className="hover:text-red-800" href="/">
							home
						</a>
					</header>

					<article className="my-10 border border-stone-900/25 bg-amber-50 p-5 sm:p-8">
						<p className="max-w-max border border-stone-900 px-2 py-1 font-bold text-xs uppercase tracking-widest">
							Privacy Policy
						</p>
						<h1 className="mt-6 font-display text-7xl leading-none text-red-800 sm:text-8xl">
							Harpist Privacy Policy
						</h1>
						<p className="mt-4 text-stone-900/70 text-sm uppercase tracking-widest">
							Effective July 6, 2026
						</p>

						<div className="mt-8 grid gap-8 text-sm leading-6">
							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									Summary
								</h2>
								<p className="mt-3">
									Harpist is a Chrome extension and local CLI for recording
									website traffic so you can turn it into API documentation. We
									do not sell personal information, run third-party analytics,
									or send recordings to Kenobi servers.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									What Harpist Records
								</h2>
								<p className="mt-3">
									When you start a recording, Harpist may capture the network
									requests and responses made by the active browser tab. That
									can include URLs, methods, headers, cookies, request bodies,
									response bodies, status codes, timestamps, and the page host.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									Where Data Goes
								</h2>
								<p className="mt-3">
									Recordings are stored in the extension&apos;s local browser
									storage. If you run the Harpist bridge, the extension syncs
									recordings to the bridge URL you configure. By default, that
									is a local address on your machine: http://localhost:4277.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									What Kenobi Receives
								</h2>
								<p className="mt-3">
									Kenobi does not receive your recordings through the extension
									or CLI. If you contact us, open an issue, or publish generated
									files somewhere public, we will receive only the information
									you choose to provide there.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									Retention And Deletion
								</h2>
								<p className="mt-3">
									You control recorded data. You can remove extension data by
									clearing Harpist&apos;s browser storage or uninstalling the
									extension. If you synced recordings to a local bridge, delete
									the corresponding local project files as well.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									Permissions
								</h2>
								<p className="mt-3">
									Harpist requests browser permissions needed to record traffic,
									save recordings, inspect the active tab, download generated
									files, and communicate with the local bridge you configure.
								</p>
							</section>

							<section>
								<h2 className="border-stone-900/25 border-b pb-2 font-bold text-sm uppercase tracking-wider">
									Contact
								</h2>
								<p className="mt-3">
									Questions can be opened at{" "}
									<ExternalLink
										className="font-bold text-red-800 underline underline-offset-4"
										href="https://github.com/kenobi-ai/harpist/issues"
									>
										github.com/kenobi-ai/harpist/issues
									</ExternalLink>
									.
								</p>
							</section>
						</div>
					</article>
				</div>
			</section>
		</main>
	);
}
