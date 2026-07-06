import type { ComponentPropsWithoutRef } from "react";

type ExternalLinkProps = Omit<ComponentPropsWithoutRef<"a">, "rel" | "target">;

export function ExternalLink(props: ExternalLinkProps) {
	return <a {...props} rel="noopener noreferrer" target="_blank" />;
}
