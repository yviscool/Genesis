const require_chunk = require('./chunk-nOFOJqeH.js');
let picocolors = require("picocolors");
picocolors = require_chunk.__toESM(picocolors);
let node_fs = require("node:fs");
node_fs = require_chunk.__toESM(node_fs);

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
		const color = error.type === "error" ? picocolors.default.red : picocolors.default.yellow;
		lines.push(color(`${tag} ${error.file}:${error.line}:${error.col}`));
		lines.push(`  ${error.message}`);
		const targetFile = sourceFile || error.file;
		if (node_fs.default.existsSync(targetFile)) try {
			const errorLine = node_fs.default.readFileSync(targetFile, "utf-8").split("\n")[error.line - 1];
			if (errorLine) {
				lines.push("");
				lines.push(picocolors.default.dim(`  ${error.line} | `) + errorLine);
				const pointer = " ".repeat(Math.max(0, error.col - 1)) + picocolors.default.red("^");
				lines.push(picocolors.default.dim("    | ") + pointer);
			}
		} catch {}
		lines.push("");
	}
	return lines.join("\n");
}

//#endregion
exports.formatCompilerError = formatCompilerError;
//# sourceMappingURL=error-formatter-BDLUfB_w.js.map