import pc from "picocolors";
import fs from "node:fs";

//#region src/error-formatter.ts
function formatCompilerError(stderr, sourceFile) {
	const lines = [];
	const errorPattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/gm;
	let match;
	const errors = [];
	while ((match = errorPattern.exec(stderr)) !== null) errors.push({
		file: match[1],
		line: Number.parseInt(match[2], 10),
		col: Number.parseInt(match[3], 10),
		type: match[4],
		message: match[5]
	});
	if (errors.length === 0) return stderr;
	for (const error of errors) {
		const tag = error.type === "error" ? "[ERROR]" : "[WARN]";
		const color = error.type === "error" ? pc.red : pc.yellow;
		lines.push(color(`${tag} ${error.file}:${error.line}:${error.col}`));
		lines.push(`  ${error.message}`);
		const targetFile = sourceFile || error.file;
		if (fs.existsSync(targetFile)) try {
			const errorLine = fs.readFileSync(targetFile, "utf-8").split("\n")[error.line - 1];
			if (errorLine) {
				lines.push("");
				lines.push(pc.dim(`  ${error.line} | `) + errorLine);
				const pointer = " ".repeat(Math.max(0, error.col - 1)) + pc.red("^");
				lines.push(pc.dim("    | ") + pointer);
			}
		} catch {}
		lines.push("");
	}
	return lines.join("\n");
}

//#endregion
export { formatCompilerError };
//# sourceMappingURL=error-formatter-3DUz7fOl.mjs.map