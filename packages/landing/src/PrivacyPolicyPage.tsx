export function PrivacyPolicyPage() {
	return (
		<main className="min-h-screen bg-parchment font-sans text-ink">
			<div aria-hidden className="h-1.5 bg-rubric" />
			<section className="ruled min-h-screen border-ink border-b-2">
				<div className="mx-auto max-w-4xl px-4 py-4 sm:px-7 lg:px-9">
					<header className="flex items-center justify-between gap-3 border-ink border-y-2 bg-vellum px-3 py-2 text-xs uppercase">
						<a
							aria-label="Harpist home"
							className="inline-flex items-center gap-2 font-bold tracking-widest"
							href="/"
						>
							<span className="grid size-8 place-items-center border-2 border-ink bg-gold font-display text-2xl leading-none tracking-normal">
								H
							</span>
							<span>Harpist</span>
						</a>
						<a className="font-bold hover:text-rubric" href="/">
							Home
						</a>
					</header>

					<article className="my-10 border-2 border-ink bg-vellum p-5 shadow-[8px_8px_0_var(--color-ink)] sm:p-8">
						<p className="max-w-max border-2 border-ink bg-gold px-2 py-1 font-bold text-xs uppercase tracking-widest">
							Privacy Policy
						</p>
						<h1 className="mt-6 font-display text-7xl leading-none text-rubric sm:text-8xl">
							Harpist Privacy Policy
						</h1>
						<p className="mt-4 text-ink/70 text-sm uppercase tracking-widest">
							Effective July 6, 2026
						</p>

						<div className="mt-8 grid gap-8 text-lg leading-8">
							<section>
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
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
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
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
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
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
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
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
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
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
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
									Permissions
								</h2>
								<p className="mt-3">
									Harpist requests browser permissions needed to record traffic,
									save recordings, inspect the active tab, download generated
									files, and communicate with the local bridge you configure.
								</p>
							</section>

							<section>
								<h2 className="border-ink border-b-2 pb-2 font-bold text-xl uppercase tracking-wider">
									Contact
								</h2>
								<p className="mt-3">
									Questions can be opened at{" "}
									<a
										className="font-bold text-lapis underline decoration-2 underline-offset-4"
										href="https://github.com/kenobi-ai/harpist/issues"
									>
										github.com/kenobi-ai/harpist/issues
									</a>
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
