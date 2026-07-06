import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type ShellCommandTone = "dark" | "light";

const shellCommandTone: Record<
	ShellCommandTone,
	{
		args: string;
		button: string;
		command: string;
		container: string;
		prompt: string;
	}
> = {
	dark: {
		args: "text-stone-50/80",
		button:
			"border-stone-50/20 text-amber-300 hover:border-amber-300 hover:bg-stone-900",
		command: "text-amber-300",
		container: "border-stone-50/20 bg-stone-950 text-stone-50",
		prompt: "text-stone-50/35",
	},
	light: {
		args: "text-stone-800",
		button:
			"border-red-900/25 text-red-800 hover:border-red-900/50 hover:bg-red-100",
		command: "text-red-800",
		container: "border-red-900 bg-red-50 text-stone-900",
		prompt: "text-red-900/40",
	},
};

const copyText = async (text: string): Promise<boolean> => {
	if (navigator.clipboard) {
		const copied = await navigator.clipboard.writeText(text).then(
			() => true,
			() => false,
		);
		if (copied) {
			return true;
		}
	}

	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.opacity = "0";
	document.body.appendChild(textarea);
	textarea.select();
	try {
		return document.execCommand("copy");
	} finally {
		textarea.remove();
	}
};

export function ShellCommand({
	className = "",
	command,
	tone = "light",
}: {
	className?: string;
	command: string;
	tone?: ShellCommandTone;
}) {
	const [copied, setCopied] = useState(false);
	const timeoutRef = useRef<number | null>(null);
	const [binary, ...args] = command.split(" ");
	const theme = shellCommandTone[tone];

	useEffect(
		() => () => {
			if (timeoutRef.current) {
				window.clearTimeout(timeoutRef.current);
			}
		},
		[],
	);

	const handleCopy = async () => {
		const copiedCommand = await copyText(command).catch(() => false);
		if (!copiedCommand) {
			return;
		}
		setCopied(true);
		if (timeoutRef.current) {
			window.clearTimeout(timeoutRef.current);
		}
		timeoutRef.current = window.setTimeout(() => setCopied(false), 1600);
	};

	return (
		<div
			className={`flex w-full items-stretch border ${theme.container} ${className}`}
		>
			<pre className="min-w-0 flex-1 overflow-x-auto px-3 py-2 font-mono text-xs leading-5 sm:text-sm">
				<code className="whitespace-pre">
					<span className={`select-none ${theme.prompt}`}>$ </span>
					<span className={theme.command}>{binary}</span>
					{args.length > 0 ? (
						<span className={theme.args}> {args.join(" ")}</span>
					) : null}
				</code>
			</pre>
			<button
				aria-label={copied ? "Copied command" : `Copy command: ${command}`}
				className={`flex w-10 shrink-0 items-center justify-center border-l transition ${theme.button}`}
				onClick={handleCopy}
				title={copied ? "Copied" : "Copy command"}
				type="button"
			>
				{copied ? (
					<CheckIcon size={16} weight="bold" />
				) : (
					<CopyIcon size={16} />
				)}
			</button>
		</div>
	);
}
