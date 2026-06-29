import { useState } from "react";
import reactLogo from "@/assets/react.svg";
import wxtLogo from "/wxt.svg";
import { RecordIcon, VoicemailIcon } from "@phosphor-icons/react";

function App() {
  const [count, setCount] = useState(0);

  return (
    <main
      className="flex min-h-[520px] w-[360px] flex-col items-start justify-start border-2 border-amber-950"
      style={{
        backgroundColor: "var(--color-teal-950)",
        backgroundImage: "url(https://assets.magiceyes.dev/grain.svg)",
        backgroundBlendMode: "soft-light",
        backgroundSize: "160px 160px",
      }}
    >
      <section className="w-full px-4 py-2 flex items-center justify-start">
        <span className="font-display text-4xl text-white">
          <span className="">H</span>arpist
        </span>
        <div className="rounded-xs bg-rose-500 px-2 pr-2.5 py-1.5 gap-1.5 ml-auto flex items-center">
          <VoicemailIcon size={22} className="text-white" weight="duotone" />
          <span className="text-white font-sans font-bold text-base leading-0">
            Record
          </span>
        </div>
      </section>
      <section className="flex min-h-0 w-full flex-1 flex-col p-4 pt-2">
        <section className="w-full flex-1 bg-olive-100 rounded-sm border-amber-950 border-2">
          hello
        </section>
      </section>
      {/*<section className="flex size-full flex-1 items-center justify-center">
        <div className="size-28 rounded-full bg-rose-700" />
      </section>*/}
      {/*<section className="flex h-full flex-col gap-5">
        <div className="flex items-center justify-between">
          <a
            href="https://wxt.dev"
            target="_blank"
            rel="noreferrer"
            className="group flex size-12 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 transition hover:border-emerald-400/70"
          >
            <img src={wxtLogo} className="size-7" alt="WXT logo" />
          </a>
          <a
            href="https://react.dev"
            target="_blank"
            rel="noreferrer"
            className="group flex size-12 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 transition hover:border-sky-400/70"
          >
            <img src={reactLogo} className="size-7" alt="React logo" />
          </a>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-emerald-300">
            Extension popup
          </p>
          <h1 className="text-3xl font-semibold tracking-normal text-white">
            WXT + React
          </h1>
          <p className="text-sm leading-6 text-zinc-400">
            A clean popup shell using Tailwind utilities instead of local
            component stylesheets.
          </p>
        </div>

        <div className="rounded-md border border-zinc-800 bg-zinc-900 p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-zinc-200">
                Template counter
              </p>
              <p className="text-xs text-zinc-500">
                Keep the starter behavior while swapping the styling layer.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCount((count) => count + 1)}
              className="h-10 rounded-md bg-emerald-400 px-3 text-sm font-semibold text-zinc-950 transition hover:bg-emerald-300 focus:outline-none focus:ring-2 focus:ring-emerald-300 focus:ring-offset-2 focus:ring-offset-zinc-950"
            >
              {count}
            </button>
          </div>
        </div>

        <button
          type="button"
          onClick={() => void browser.runtime.openOptionsPage()}
          className="mt-auto h-11 rounded-md border border-zinc-700 px-4 text-sm font-medium text-zinc-100 transition hover:border-zinc-500 hover:bg-zinc-900 focus:outline-none focus:ring-2 focus:ring-zinc-400 focus:ring-offset-2 focus:ring-offset-zinc-950"
        >
          Open dashboard
        </button>
      </section>*/}
    </main>
  );
}

export default App;
