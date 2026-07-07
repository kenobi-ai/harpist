import { CheckIcon, CopyIcon } from "@phosphor-icons/react";
import { useEffect, useRef, useState } from "react";

type ShellCommandTone = "dark" | "light";

const shellCommandTone: Record<
	ShellCommandTone,
	{
		args: string;
		command: string;
		container: string;
		icon: string;
		message: string;
		overlay: string;
		prompt: string;
	}
> = {
	dark: {
		args: "text-stone-50/80",
		command: "text-amber-300",
		container:
			"border-stone-50/20 bg-stone-950/80 text-stone-50 backdrop-blur-md hover:border-amber-300/70 hover:bg-stone-900/80",
		icon: "border-stone-50/20 text-amber-300 group-hover:border-amber-300/70",
		message: "text-amber-300/80",
		overlay: "bg-stone-950/55",
		prompt: "text-stone-50/35",
	},
	light: {
		args: "text-stone-800",
		command: "text-red-800",
		container:
			"border-red-900 bg-red-50/75 text-stone-900 backdrop-blur-md hover:border-red-900 hover:bg-red-100/75",
		icon: "border-red-900/25 text-red-800 group-hover:border-red-900/50",
		message: "text-red-800/75",
		overlay: "bg-red-50/65",
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
		<button
			aria-label={copied ? "Copied command" : `Copy command: ${command}`}
			className={`group relative flex w-full cursor-pointer items-stretch overflow-hidden border text-left transition ${theme.container} ${className}`}
			onClick={handleCopy}
			title={copied ? "Copied" : "Copy command"}
			type="button"
		>
			<code className="min-w-0 flex-1 overflow-x-auto whitespace-pre px-3 py-2 font-mono text-xs leading-5 sm:text-sm">
				<span className={`select-none transition ${theme.prompt}`}>$ </span>
				<span className={`transition ${theme.command}`}>{binary}</span>
				{args.length > 0 ? (
					<span className={`transition ${theme.args}`}> {args.join(" ")}</span>
				) : null}
			</code>
			<span
				aria-hidden
				className={`absolute inset-y-0 right-10 left-0 flex items-center justify-center backdrop-blur-sm transition ${
					copied ? "opacity-100" : "opacity-0"
				} ${theme.overlay}`}
			>
				<span
					className={`font-bold text-[10px] uppercase leading-none tracking-wider ${theme.message}`}
				>
					copied
				</span>
			</span>
			<span
				aria-hidden
				className={`relative z-10 flex w-10 shrink-0 items-center justify-center border-l transition ${theme.icon}`}
			>
				{copied ? (
					<CheckIcon size={16} weight="bold" />
				) : (
					<CopyIcon
						className="transition-transform group-hover:scale-110"
						size={16}
					/>
				)}
			</span>
		</button>
	);
}
