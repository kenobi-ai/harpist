const metrics = [
  { label: 'Rules active', value: '12' },
  { label: 'Pages scanned', value: '248' },
  { label: 'Actions queued', value: '3' },
];

const activity = [
  'Popup moved to Tailwind utilities',
  'Options dashboard registered with WXT',
  'Shared Tailwind import added for React entrypoints',
];

function Dashboard() {
  return (
    <main className="min-h-screen bg-zinc-50 text-zinc-950">
      <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col px-6 py-6">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-emerald-700">
              Harp
            </p>
            <h1 className="mt-2 text-3xl font-semibold tracking-normal">
              Dashboard
            </h1>
          </div>
          <button
            type="button"
            className="h-10 rounded-md bg-zinc-950 px-4 text-sm font-semibold text-white transition hover:bg-zinc-800 focus:outline-none focus:ring-2 focus:ring-zinc-900 focus:ring-offset-2"
          >
            Sync now
          </button>
        </header>

        <section className="grid gap-4 py-6 sm:grid-cols-3">
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rounded-md border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <p className="text-sm text-zinc-500">{metric.label}</p>
              <p className="mt-3 text-3xl font-semibold tracking-normal">
                {metric.value}
              </p>
            </div>
          ))}
        </section>

        <section className="grid flex-1 gap-6 lg:grid-cols-[1fr_320px]">
          <div className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold">Workspace status</h2>
                <p className="mt-1 text-sm leading-6 text-zinc-500">
                  Starter data for the extension dashboard surface.
                </p>
              </div>
              <span className="rounded-md bg-emerald-100 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                Healthy
              </span>
            </div>

            <div className="mt-6 h-56 rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-4">
              <div className="flex h-full items-end gap-3">
                {[42, 68, 52, 86, 74, 94, 62].map((height, index) => (
                  <div
                    key={index}
                    className="flex flex-1 items-end rounded-sm bg-emerald-200"
                    style={{ height: `${height}%` }}
                  >
                    <div className="h-2/3 w-full rounded-sm bg-emerald-500" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <aside className="rounded-md border border-zinc-200 bg-white p-5 shadow-sm">
            <h2 className="text-lg font-semibold">Recent activity</h2>
            <ul className="mt-5 space-y-4">
              {activity.map((item) => (
                <li key={item} className="flex gap-3 text-sm text-zinc-600">
                  <span className="mt-1 size-2 rounded-full bg-emerald-500" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </aside>
        </section>
      </div>
    </main>
  );
}

export default Dashboard;
