import crypto from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";
import { chunk } from "es-toolkit";
import pc from "picocolors";
import fs, { createReadStream } from "node:fs";
import fs$1 from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { execa } from "execa";
import { consola } from "consola";
import ora from "ora";

//#region src/dataset.ts
function defineDataset(config) {
	return {
		__genesisDataset: 2,
		config
	};
}
function isDataset(value) {
	return Boolean(value && typeof value === "object" && value.__genesisDataset === 2 && typeof value.config === "object");
}

//#endregion
//#region src/format.ts
const fmt = {
	line(...items) {
		return {
			kind: "line",
			items
		};
	},
	lines(...rows) {
		return createFormatDocument(rows.map((row) => normalizeRow(row)));
	},
	table(rows) {
		return {
			kind: "table",
			rows
		};
	},
	grid(rows) {
		return {
			kind: "grid",
			rows
		};
	},
	raw(text) {
		return {
			kind: "raw",
			text
		};
	}
};
function createFormatDocument(nodes) {
	return {
		__genesisFormat: 2,
		nodes
	};
}
function isFormatNode(value) {
	if (!value || typeof value !== "object") return false;
	const kind = value.kind;
	return kind === "line" || kind === "table" || kind === "grid" || kind === "raw";
}
function isFormatDocument(value) {
	return Boolean(value && typeof value === "object" && value.__genesisFormat === 2 && Array.isArray(value.nodes) && value.nodes.every(isFormatNode));
}
function normalizeFormat(value) {
	if (isFormatDocument(value)) return value;
	if (isFormatNode(value)) return createFormatDocument([value]);
	throw new Error("Dataset format() must return a v2 format document created with fmt.*.");
}
function renderFormatDocument(document) {
	return (isFormatDocument(document) ? document : createFormatDocument([document])).nodes.map(renderNode).join("\n");
}
function normalizeRow(row) {
	if (isFormatNode(row)) return row;
	if (Array.isArray(row)) return fmt.line(...row);
	return fmt.line(row);
}
function renderNode(node) {
	switch (node.kind) {
		case "line": return node.items.map(renderAtom).join(" ");
		case "table": return node.rows.map((row) => row.map(renderAtom).join(" ")).join("\n");
		case "grid": return node.rows.map((row) => Array.isArray(row) ? row.map(renderAtom).join("") : row).join("\n");
		case "raw": return node.text;
	}
}
function renderAtom(value) {
	return value == null ? "" : String(value);
}

//#endregion
//#region src/generator/core.ts
const MAX_RANDOM = 1 - Number.EPSILON;
let randomSource = Math.random;
const scopedRandomSource = new AsyncLocalStorage();
function normalizedRandom(value) {
	if (!Number.isFinite(value)) return 0;
	if (value <= 0) return 0;
	if (value >= 1) return MAX_RANDOM;
	return value;
}
/**
* 注入随机源（返回值应位于 [0, 1)）。
*/
function withRng(rng) {
	if (typeof rng !== "function") throw new Error("Random source must be a function.");
	randomSource = rng;
}
/**
* 重置为默认随机源 Math.random。
*/
function resetRng() {
	randomSource = Math.random;
}
/**
* Run a synchronous or async callback with an isolated random source.
* This is used by v2 generator instances so per-case RNG does not mutate the
* legacy process-global G random source.
*/
function runWithRng(rng, callback) {
	if (typeof rng !== "function") throw new Error("Random source must be a function.");
	return scopedRandomSource.run(rng, callback);
}
/**
* 获取 [0, 1) 随机小数。
*/
function rand() {
	return normalizedRandom((scopedRandomSource.getStore() ?? randomSource)());
}
/**
* 生成 [min, max] 范围内的随机整数
*/
function int$1(min, max) {
	min = Math.ceil(min);
	max = Math.floor(max);
	return Math.floor(rand() * (max - min + 1)) + min;
}
/**
* 随机打乱数组
*/
function shuffle(array$1) {
	return shuffleInPlace([...array$1]);
}
/**
* In-place Fisher-Yates shuffle for mutable arrays.
*/
function shuffleInPlace(array$1) {
	const result = array$1;
	for (let i = result.length - 1; i > 0; i--) {
		const j = int$1(0, i);
		[result[i], result[j]] = [result[j], result[i]];
	}
	return result;
}
function sample(population, k) {
	if (k === void 0) {
		if (population.length === 0) throw new Error("Cannot sample from an empty array.");
		return population[int$1(0, population.length - 1)];
	}
	if (k < 0) throw new Error("Sample size cannot be negative.");
	if (k > population.length) throw new Error(`Sample size ${k} exceeds population size ${population.length}.`);
	if (k === 0) return [];
	if (k === population.length) return shuffle(population);
	const indices = Array.from({ length: population.length }, (_, i) => i);
	for (let i = 0; i < k; i++) {
		const j = i + int$1(0, population.length - i - 1);
		[indices[i], indices[j]] = [indices[j], indices[i]];
	}
	return indices.slice(0, k).map((i) => population[i]);
}
/**
* 数组分块
*/
function chunk$1(array$1, size) {
	return chunk(array$1, size);
}

//#endregion
//#region src/generator/numbers.ts
let primeCacheMax = 1;
const primeCache = [];
function isPrimeByCache(candidate) {
	const limit = Math.floor(Math.sqrt(candidate));
	for (const p of primeCache) {
		if (p > limit) break;
		if (candidate % p === 0) return false;
	}
	return true;
}
function ensurePrimesUpTo(max) {
	if (max <= primeCacheMax) return;
	const start = Math.max(2, primeCacheMax + 1);
	for (let n = start; n <= max; n++) if (isPrimeByCache(n)) primeCache.push(n);
	primeCacheMax = max;
}
function lowerBound(arr, target) {
	let l = 0;
	let r = arr.length;
	while (l < r) {
		const mid = l + r >> 1;
		if (arr[mid] < target) l = mid + 1;
		else r = mid;
	}
	return l;
}
function gcd(a, b) {
	while (b !== 0) [a, b] = [b, a % b];
	return a;
}
const int = int$1;
function ints(count, min, max) {
	return Array.from({ length: count }, () => int$1(min, max));
}
function distinctInts(count, min, max) {
	const range = max - min + 1;
	if (count > range) throw new Error(`Cannot generate ${count} distinct integers from a range of size ${range}.`);
	if (count <= 0) return [];
	if (range <= 2e6 && count / range >= .6) {
		const pool = Array.from({ length: range }, (_, i) => min + i);
		for (let i = 0; i < count; i++) {
			const j = i + int$1(0, range - i - 1);
			[pool[i], pool[j]] = [pool[j], pool[i]];
		}
		return pool.slice(0, count);
	}
	const values = /* @__PURE__ */ new Set();
	while (values.size < count) values.add(int$1(min, max));
	return Array.from(values);
}
function float(min, max, precision = 2) {
	const value = rand() * (max - min) + min;
	return parseFloat(value.toFixed(precision));
}
function even(min, max) {
	const start = min % 2 === 0 ? min : min + 1;
	const end = max % 2 === 0 ? max : max - 1;
	if (start > end) throw new Error(`No even numbers exist in the range [${min}, ${max}].`);
	const numChoices = (end - start) / 2;
	return start + int$1(0, numChoices) * 2;
}
function odd(min, max) {
	const start = min % 2 !== 0 ? min : min + 1;
	const end = max % 2 !== 0 ? max : max - 1;
	if (start > end) throw new Error(`No odd numbers exist in the range [${min}, ${max}].`);
	const numChoices = (end - start) / 2;
	return start + int$1(0, numChoices) * 2;
}
function prime(min, max) {
	ensurePrimesUpTo(max);
	const start = lowerBound(primeCache, min);
	if (start >= primeCache.length || primeCache[start] > max) throw new Error(`No prime numbers exist in the range [${min}, ${max}].`);
	let end = lowerBound(primeCache, max + 1) - 1;
	if (end < start) throw new Error(`No prime numbers exist in the range [${min}, ${max}].`);
	return primeCache[int$1(start, end)];
}
function coprime(min, max) {
	for (let attempt = 0; attempt < 1e3; attempt++) {
		const a = int$1(min, max);
		const b = int$1(min, max);
		if (a !== b && gcd(a, b) === 1) return [a, b];
	}
	return [1, int$1(Math.max(2, min), max)];
}
function divisible(min, max, d) {
	if (d === 0) throw new Error("Divisor cannot be zero.");
	const start = Math.ceil(min / d) * d;
	const end = Math.floor(max / d) * d;
	if (start > end) throw new Error(`No numbers divisible by ${d} exist in the range [${min}, ${max}].`);
	const count = (end - start) / d;
	return start + int$1(0, count) * d;
}
function sequence(options) {
	switch (options.type) {
		case "arithmetic": {
			const { start, diff, count } = options;
			return Array.from({ length: count }, (_, i) => start + i * diff);
		}
		case "geometric": {
			const { start, ratio, count } = options;
			return Array.from({ length: count }, (_, i) => start * Math.pow(ratio, i));
		}
		case "fibonacci": {
			const { count, first = 1, second = 1 } = options;
			if (count <= 0) return [];
			if (count === 1) return [first];
			const result = [first, second];
			for (let i = 2; i < count; i++) result.push(result[i - 1] + result[i - 2]);
			return result;
		}
		case "custom": {
			const { init, fn, count } = options;
			if (count <= init.length) return init.slice(0, count);
			const result = [...init];
			for (let i = init.length; i < count; i++) result.push(fn(result));
			return result;
		}
	}
}

//#endregion
//#region src/generator/strings.ts
const CHARSET = {
	LOWERCASE: "abcdefghijklmnopqrstuvwxyz",
	UPPERCASE: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
	DIGITS: "0123456789",
	get ALPHANUMERIC() {
		return this.LOWERCASE + this.UPPERCASE + this.DIGITS;
	},
	get ALPHA() {
		return this.LOWERCASE + this.UPPERCASE;
	},
	get BASE36() {
		return this.DIGITS + this.UPPERCASE;
	}
};
function string(len, charset = CHARSET.ALPHANUMERIC) {
	let result = "";
	for (let i = 0; i < len; i++) result += charset.charAt(int$1(0, charset.length - 1));
	return result;
}
function palindrome(len, charset = CHARSET.LOWERCASE) {
	if (len <= 0) return "";
	const left = string(Math.floor(len / 2), charset);
	const right = left.split("").reverse().join("");
	if (len % 2 === 1) return left + sample(charset.split("")) + right;
	return left + right;
}
function word(minLen, maxLen) {
	return string(int$1(minLen, maxLen), CHARSET.LOWERCASE);
}
function words(count, minLen, maxLen) {
	return Array.from({ length: count }, () => word(minLen, maxLen));
}
function brackets(n, options = {}) {
	const { types = "()" } = options;
	const pairs = [];
	if (types.includes("()")) pairs.push(["(", ")"]);
	if (types.includes("[]")) pairs.push(["[", "]"]);
	if (types.includes("{}")) pairs.push(["{", "}"]);
	if (pairs.length === 0) pairs.push(["(", ")"]);
	const result = [];
	const stack = [];
	for (let i = 0; i < n; i++) {
		const pair = pairs[int$1(0, pairs.length - 1)];
		result.push(pair[0]);
		stack.push(pair);
	}
	while (stack.length > 0) {
		const idx = int$1(0, stack.length - 1);
		const pair = stack.splice(idx, 1)[0];
		result.push(pair[1]);
	}
	return result.join("");
}

//#endregion
//#region src/generator/arrays.ts
function array(count, itemGenerator) {
	return Array.from({ length: count }, (_, i) => itemGenerator(i));
}
function sorted(count, min, max, options = {}) {
	const { order = "asc" } = options;
	if (order === "strictlyAsc" || order === "strictlyDesc") return distinctInts(count, min, max).sort((a, b) => order === "strictlyAsc" ? a - b : b - a);
	return ints(count, min, max).sort((a, b) => order === "asc" ? a - b : b - a);
}
function sparse(count, min, max, gap) {
	if ((count - 1) * gap > max - min) throw new Error(`Cannot generate ${count} sparse numbers with gap ${gap} in range [${min}, ${max}]. Range is too small.`);
	const sparseValues = sorted(count, 0, max - min - (count - 1) * gap).map((val, i) => min + val + i * gap);
	return shuffleInPlace(sparseValues);
}
function partition(count, sum, options = {}) {
	const { minVal = 1 } = options;
	if (count * minVal > sum) throw new Error(`Cannot partition sum ${sum} into ${count} parts with minVal ${minVal}. Required sum is at least ${count * minVal}.`);
	const adjustedSum = sum - count * minVal;
	const points$1 = [
		0,
		...sorted(count - 1, 0, adjustedSum),
		adjustedSum
	];
	const parts = [];
	for (let i = 0; i < count; i++) parts.push(points$1[i + 1] - points$1[i] + minVal);
	return shuffleInPlace(parts);
}
function matrix(rows, cols, cellGenerator) {
	return Array.from({ length: rows }, (_, i) => Array.from({ length: cols }, (__, j) => cellGenerator(i, j)));
}
function grid01(rows, cols, density = .5) {
	return matrix(rows, cols, () => rand() < density ? 1 : 0);
}
function maze(rows, cols, options = {}) {
	const { wall = "#", road = "." } = options;
	const grid = Array.from({ length: rows }, () => Array(cols).fill(wall));
	const visited = Array.from({ length: rows }, () => Array(cols).fill(false));
	const stack = [];
	const startR = 1, startC = 1;
	if (startR >= rows || startC >= cols) return grid;
	grid[startR][startC] = road;
	visited[startR][startC] = true;
	stack.push([startR, startC]);
	while (stack.length > 0) {
		const [r, c] = stack.pop();
		const dirs = shuffle([
			[-2, 0],
			[2, 0],
			[0, -2],
			[0, 2]
		]);
		for (const [dr, dc] of dirs) {
			const nr = r + dr, nc = c + dc;
			if (nr > 0 && nr < rows - 1 && nc > 0 && nc < cols - 1 && !visited[nr][nc]) {
				grid[r + dr / 2][c + dc / 2] = road;
				grid[nr][nc] = road;
				visited[nr][nc] = true;
				stack.push([r, c]);
				stack.push([nr, nc]);
				break;
			}
		}
	}
	return grid;
}
function allocateWithCap(total, slots, cap) {
	const result = new Array(slots).fill(0);
	let remain = total;
	for (let i = 0; i < slots; i++) {
		const maxRest = (slots - i - 1) * cap;
		const low = Math.max(0, remain - maxRest);
		const high = Math.min(cap, remain);
		const val = int$1(low, high);
		result[i] = val;
		remain -= val;
	}
	return shuffle(result);
}
function intervals(n, min, max, options = {}) {
	const { overlapping = true, sorted: shouldSort = false, minLen = 1, maxLen = max - min, allowGaps = false } = options;
	const result = [];
	if (n <= 0) return result;
	if (overlapping) {
		const upperLen = Math.min(maxLen, max - min + 1);
		if (minLen < 1 || upperLen < minLen) throw new Error(`Cannot generate intervals in range [${min}, ${max}] with minLen=${minLen}, maxLen=${maxLen}.`);
		for (let i = 0; i < n; i++) {
			const len = int$1(minLen, upperLen);
			const l = int$1(min, max - len + 1);
			result.push([l, l + len - 1]);
		}
	} else {
		const totalMinSpace = n * minLen;
		if (totalMinSpace > max - min + 1) throw new Error(`Cannot generate ${n} non-overlapping intervals in range [${min}, ${max}].`);
		if (!allowGaps) {
			const extraLens = partition(n, max - min + 1 - totalMinSpace, { minVal: 0 });
			let current$1 = min;
			for (let i = 0; i < n; i++) {
				const len = minLen + extraLens[i];
				result.push([current$1, current$1 + len - 1]);
				current$1 += len;
			}
			return shouldSort ? result : shuffle(result);
		}
		const totalSpace = max - min + 1;
		const maxExtraPerInterval = Math.max(0, maxLen - minLen);
		const maxUsableLength = totalMinSpace + n * maxExtraPerInterval;
		const extraLength = Math.min(totalSpace, maxUsableLength) - totalMinSpace;
		if (extraLength < 0) throw new Error(`Cannot generate ${n} non-overlapping intervals in range [${min}, ${max}] with minLen=${minLen}.`);
		const lengths = allocateWithCap(extraLength, n, maxExtraPerInterval).map((v) => minLen + v);
		const gapTotal = totalSpace - lengths.reduce((acc, len) => acc + len, 0);
		const gaps = partition(n + 1, gapTotal, { minVal: 0 });
		let current = min + gaps[0];
		for (let i = 0; i < n; i++) {
			const len = lengths[i];
			const l = current;
			const r = l + len - 1;
			result.push([l, r]);
			current = r + 1 + gaps[i + 1];
		}
		return shouldSort ? result : shuffle(result);
	}
	return shouldSort ? result.sort((a, b) => a[0] - b[0]) : result;
}
function permutation(n, oneBased = true) {
	const arr = Array.from({ length: n }, (_, i) => oneBased ? i + 1 : i);
	return shuffleInPlace(arr);
}

//#endregion
//#region src/generator/datetime.ts
function isLeap(year$1) {
	return year$1 % 4 === 0 && year$1 % 100 !== 0 || year$1 % 400 === 0;
}
function year(minYear = 1970, maxYear = (/* @__PURE__ */ new Date()).getFullYear()) {
	return int$1(minYear, maxYear);
}
function date(options = {}) {
	const { minYear = 1970, maxYear = (/* @__PURE__ */ new Date()).getFullYear(), format = "YYYY-MM-DD" } = options;
	const y = year(minYear, maxYear);
	const month = int$1(1, 12);
	const days = [
		31,
		28,
		31,
		30,
		31,
		30,
		31,
		31,
		30,
		31,
		30,
		31
	];
	if (isLeap(y)) days[1] = 29;
	const day = int$1(1, days[month - 1]);
	return format.replace("YYYY", String(y)).replace("MM", String(month).padStart(2, "0")).replace("DD", String(day).padStart(2, "0"));
}

//#endregion
//#region src/generator/geometry.ts
function points(n, minVal, maxVal, options = {}) {
	const { type = "random" } = options;
	if (type === "random") {
		const range = maxVal - minVal + 1;
		const maxPossible = range * range;
		const target = Math.min(n, maxPossible);
		if (maxPossible <= 1e6 && target / maxPossible >= .65) {
			const pool = Array.from({ length: maxPossible }, (_, i) => i);
			for (let i = 0; i < target; i++) {
				const j = i + int$1(0, maxPossible - i - 1);
				[pool[i], pool[j]] = [pool[j], pool[i]];
			}
			return pool.slice(0, target).map((idx) => {
				return [minVal + Math.floor(idx / range), minVal + idx % range];
			});
		}
		const pointSet = /* @__PURE__ */ new Set();
		while (pointSet.size < target) pointSet.add(`${int$1(minVal, maxVal)},${int$1(minVal, maxVal)}`);
		return Array.from(pointSet).map((p) => p.split(",").map(Number));
	}
	if (type === "collinear") {
		if (n <= 1) return points(n, minVal, maxVal);
		for (let attempt = 0; attempt < 50; attempt++) {
			let dx, dy;
			do {
				dx = int$1(-10, 10);
				dy = int$1(-10, 10);
			} while (dx === 0 && dy === 0);
			const x0_min = dx >= 0 ? minVal : minVal - (n - 1) * dx;
			const x0_max = dx >= 0 ? maxVal - (n - 1) * dx : maxVal;
			const y0_min = dy >= 0 ? minVal : minVal - (n - 1) * dy;
			const y0_max = dy >= 0 ? maxVal - (n - 1) * dy : maxVal;
			if (x0_min <= x0_max && y0_min <= y0_max) {
				const x0 = int$1(x0_min, x0_max);
				const y0 = int$1(y0_min, y0_max);
				return shuffle(Array.from({ length: n }, (_, i) => [x0 + i * dx, y0 + i * dy]));
			}
		}
		return points(n, minVal, maxVal);
	}
	return [];
}
function convexHull(n, minVal, maxVal) {
	if (n < 3) return points(n, minVal, maxVal);
	const angles = [];
	for (let i = 0; i < n; i++) angles.push(float(0, 2 * Math.PI, 6));
	angles.sort((a, b) => a - b);
	const cx = (minVal + maxVal) / 2;
	const cy = (minVal + maxVal) / 2;
	const maxR = (maxVal - minVal) / 2 * .9;
	const minR = maxR * .3;
	const result = [];
	for (const angle of angles) {
		const r = float(minR, maxR, 2);
		const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
		const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
		result.push([x, y]);
	}
	const unique = Array.from(new Set(result.map((p) => `${p[0]},${p[1]}`))).map((s) => s.split(",").map(Number));
	while (unique.length < n) {
		const angle = float(0, 2 * Math.PI, 6);
		const r = float(minR, maxR, 2);
		const x = Math.max(minVal, Math.min(maxVal, Math.round(cx + r * Math.cos(angle))));
		const y = Math.max(minVal, Math.min(maxVal, Math.round(cy + r * Math.sin(angle))));
		const key = `${x},${y}`;
		if (!unique.some((p) => `${p[0]},${p[1]}` === key)) unique.push([x, y]);
	}
	return unique.slice(0, n);
}
function polygon(n, minVal, maxVal) {
	if (n < 3) return points(n, minVal, maxVal);
	const pts = points(n, minVal, maxVal);
	const cx = pts.reduce((sum, p) => sum + p[0], 0) / n;
	const cy = pts.reduce((sum, p) => sum + p[1], 0) / n;
	return pts.sort((a, b) => {
		return Math.atan2(a[1] - cy, a[0] - cx) - Math.atan2(b[1] - cy, b[0] - cx);
	});
}

//#endregion
//#region src/generator/graphs.ts
function tree(n, options = {}) {
	const { type = "random", oneBased = true, weighted = false } = options;
	if (n <= 1) return [];
	const edges = [];
	if (type === "path") {
		const nodes = permutation(n, false);
		for (let i = 0; i < n - 1; i++) edges.push([nodes[i], nodes[i + 1]]);
	} else if (type === "star") {
		const nodes = permutation(n, false);
		for (let i = 1; i < n; i++) edges.push([nodes[0], nodes[i]]);
	} else {
		const nodes = permutation(n, false);
		for (let i = 1; i < n; i++) edges.push([nodes[i], nodes[int$1(0, i - 1)]]);
	}
	const result = shuffleInPlace(edges);
	if (weighted) {
		const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
		result.forEach((e) => e.push(int$1(minW, maxW)));
	}
	if (oneBased) result.forEach((e) => {
		e[0] += 1;
		e[1] += 1;
	});
	return result;
}
function graph(n, m, options = {}) {
	const { type = "simple", weighted = false, connected = false, noSelfLoops = true, oneBased = true, negativeCycle = false } = options;
	let { directed = false } = options;
	if (type === "dag" && options.directed === void 0) directed = true;
	if (negativeCycle && type === "dag") throw new Error("Option 'negativeCycle' cannot be used with DAG graphs.");
	if (n <= 0) return [];
	if (type === "wheel") {
		if (n < 4) throw new Error("Wheel graph requires at least 4 vertices.");
		const edges = [];
		for (let i = 1; i < n; i++) edges.push([0, i]);
		for (let i = 1; i < n; i++) edges.push([i, i === n - 1 ? 1 : i + 1]);
		let result$1 = edges;
		if (weighted) {
			const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
			result$1.forEach((e) => e.push(int$1(minW, maxW)));
		}
		if (oneBased) result$1 = result$1.map((e) => e.map((v, i) => i < 2 ? v + 1 : v));
		return shuffleInPlace(result$1);
	}
	if (type === "complete") {
		const edges = [];
		for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
			edges.push([i, j]);
			if (directed) edges.push([j, i]);
		}
		let result$1 = edges;
		if (weighted) {
			const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
			result$1.forEach((e) => e.push(int$1(minW, maxW)));
		}
		if (oneBased) result$1 = result$1.map((e) => e.map((v, i) => i < 2 ? v + 1 : v));
		return shuffleInPlace(result$1);
	}
	if (type === "tree") {
		if (m !== n - 1) throw new Error(`A tree with ${n} vertices must have ${n - 1} edges.`);
		return tree(n, {
			oneBased,
			weighted
		});
	}
	if (connected && m < n - 1) throw new Error(`A connected graph needs at least ${n - 1} edges.`);
	let maxEdges;
	if (type === "dag") maxEdges = n * (n - 1) / 2;
	else if (type === "bipartite") {
		const h = Math.floor(n / 2);
		maxEdges = h * (n - h) * (directed ? 2 : 1);
	} else maxEdges = directed ? noSelfLoops ? n * (n - 1) : n * n : noSelfLoops ? n * (n - 1) / 2 : n * (n + 1) / 2;
	if (m > maxEdges) throw new Error(`Graph with ${n} vertices of type '${type}' (directed: ${directed}) can have at most ${maxEdges} edges. Requested: ${m}.`);
	const edgeSet = /* @__PURE__ */ new Set();
	const toEdgeKey = (u, v) => directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;
	const addEdge = (u, v) => {
		if (noSelfLoops && u === v) return false;
		const key = toEdgeKey(u, v);
		if (edgeSet.has(key)) return false;
		edgeSet.add(key);
		return true;
	};
	const fillEdges = (randomEdge, enumerateCandidates) => {
		let failedAttempts = 0;
		const maxFailedAttempts = Math.max(2e3, (m - edgeSet.size) * 25);
		while (edgeSet.size < m) {
			const [u, v] = randomEdge();
			const sizeBefore = edgeSet.size;
			addEdge(u, v);
			if (edgeSet.size === sizeBefore) {
				failedAttempts++;
				if (failedAttempts >= maxFailedAttempts) {
					const candidates = enumerateCandidates().filter(([cu, cv]) => !edgeSet.has(toEdgeKey(cu, cv)));
					const remain = m - edgeSet.size;
					if (remain > candidates.length) throw new Error("Not enough candidate edges to satisfy requested m.");
					for (let i = 0; i < remain; i++) {
						const j = i + int$1(0, candidates.length - i - 1);
						[candidates[i], candidates[j]] = [candidates[j], candidates[i]];
						const [eu, ev] = candidates[i];
						addEdge(eu, ev);
					}
					return;
				}
			} else failedAttempts = 0;
		}
	};
	if (type === "dag") {
		const nodes = permutation(n, false);
		if (connected) for (let i = 1; i < n; i++) addEdge(nodes[int$1(0, i - 1)], nodes[i]);
		fillEdges(() => {
			const i1 = int$1(0, n - 1);
			let i2 = int$1(0, n - 1);
			while (i1 === i2) i2 = int$1(0, n - 1);
			return [nodes[Math.min(i1, i2)], nodes[Math.max(i1, i2)]];
		}, () => {
			const candidates = [];
			for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) candidates.push([nodes[i], nodes[j]]);
			return candidates;
		});
	} else if (type === "bipartite") {
		const nodes = permutation(n, false);
		const C = directed ? 2 : 1;
		const disc = n * n - 4 * m / C;
		const sqrtD = Math.sqrt(Math.max(0, disc));
		const validMin = Math.max(1, Math.ceil((n - sqrtD) / 2));
		const validMax = Math.min(n - 1, Math.floor((n + sqrtD) / 2));
		const ps = int$1(validMin, validMax);
		const setA = nodes.slice(0, ps);
		const setB = nodes.slice(ps);
		if (connected) {
			addEdge(setA[0], setB[0]);
			for (const u of [...setA.slice(1), ...setB.slice(1)]) addEdge(u, setA.includes(u) ? sample(setB) : sample(setA));
		}
		fillEdges(() => {
			if (directed && int$1(0, 1) === 1) return [sample(setB), sample(setA)];
			return [sample(setA), sample(setB)];
		}, () => {
			const candidates = [];
			for (const u of setA) for (const v of setB) {
				candidates.push([u, v]);
				if (directed) candidates.push([v, u]);
			}
			return candidates;
		});
	} else {
		if (connected) tree(n, {
			type: "random",
			oneBased: false
		}).forEach(([u, v]) => addEdge(u, v));
		fillEdges(() => [int$1(0, n - 1), int$1(0, n - 1)], () => {
			const candidates = [];
			if (directed) for (let u = 0; u < n; u++) for (let v = 0; v < n; v++) {
				if (noSelfLoops && u === v) continue;
				candidates.push([u, v]);
			}
			else for (let u = 0; u < n; u++) {
				const startV = noSelfLoops ? u + 1 : u;
				for (let v = startV; v < n; v++) candidates.push([u, v]);
			}
			return candidates;
		});
	}
	let result = Array.from(edgeSet).map((k) => k.split(",").map(Number));
	if (weighted || negativeCycle) {
		const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
		const maxAbsWeight = Math.max(Math.abs(minW), Math.abs(maxW), 1);
		result.forEach((e) => e.push(int$1(minW, maxW)));
		if (negativeCycle) {
			if (result.length === 0) throw new Error("Option 'negativeCycle' requires at least one edge.");
			const edgeKey = (u, v) => directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;
			const edgeIndex = /* @__PURE__ */ new Map();
			result.forEach((e, idx) => edgeIndex.set(edgeKey(e[0], e[1]), idx));
			const requiredCycle = [];
			if (directed) if (n === 1) {
				if (noSelfLoops) throw new Error("Option 'negativeCycle' with directed graphs requires n >= 2 when self-loops are disabled.");
				requiredCycle.push([0, 0]);
			} else if (n === 2) requiredCycle.push([0, 1], [1, 0]);
			else requiredCycle.push([0, 1], [1, 2], [2, 0]);
			else requiredCycle.push([result[0][0], result[0][1]]);
			if (result.length < requiredCycle.length) throw new Error(`Option 'negativeCycle' requires at least ${requiredCycle.length} edges, but got ${result.length}.`);
			const requiredKeys = new Set(requiredCycle.map(([u, v]) => edgeKey(u, v)));
			const upsertEdge = (u, v) => {
				const key = edgeKey(u, v);
				const existingIndex = edgeIndex.get(key);
				if (existingIndex !== void 0) return existingIndex;
				const replaceIndex = result.findIndex((e) => !requiredKeys.has(edgeKey(e[0], e[1])));
				const targetIndex = replaceIndex === -1 ? 0 : replaceIndex;
				const oldKey = edgeKey(result[targetIndex][0], result[targetIndex][1]);
				edgeIndex.delete(oldKey);
				result[targetIndex][0] = u;
				result[targetIndex][1] = v;
				edgeIndex.set(key, targetIndex);
				return targetIndex;
			};
			const cycleEdgeIndices = requiredCycle.map(([u, v]) => upsertEdge(u, v));
			for (const idx of cycleEdgeIndices) result[idx][2] = -int$1(1, maxAbsWeight);
		}
	}
	if (oneBased) result = result.map((e) => e.map((v, i) => i < 2 ? v + 1 : v));
	return shuffleInPlace(result);
}
function binaryTree(n, options = {}) {
	const { type = "random", oneBased = true } = options;
	if (n <= 0) return {
		edges: [],
		root: oneBased ? 1 : 0
	};
	const offset = oneBased ? 1 : 0;
	const edges = [];
	let root = offset;
	if (type === "complete") for (let i = 0; i < n; i++) {
		const left = 2 * i + 1;
		const right = 2 * i + 2;
		if (left < n) edges.push([i + offset, left + offset]);
		if (right < n) edges.push([i + offset, right + offset]);
	}
	else if (type === "skewed") {
		const nodes = permutation(n, false);
		for (let i = 0; i < n - 1; i++) edges.push([nodes[i] + offset, nodes[i + 1] + offset]);
	} else {
		const nodes = permutation(n, false);
		const children = new Array(n).fill(0);
		for (let i = 1; i < n; i++) {
			let parent;
			do
				parent = nodes[int$1(0, i - 1)];
			while (children[parent] >= 2);
			children[parent]++;
			edges.push([parent + offset, nodes[i] + offset]);
		}
	}
	return {
		edges: shuffleInPlace(edges),
		root
	};
}

//#endregion
//#region src/generator/base.ts
function convert(input, fromRadix, toRadix) {
	if (fromRadix < 2 || fromRadix > 36 || toRadix < 2 || toRadix > 36) throw new Error(`Radix must be an integer between 2 and 36. Received: from=${fromRadix}, to=${toRadix}`);
	const inputStr = String(input);
	let val;
	try {
		if (fromRadix === 10) val = BigInt(inputStr);
		else {
			val = BigInt(0);
			for (const c of inputStr.toUpperCase()) {
				const d = CHARSET.BASE36.indexOf(c);
				if (d === -1 || d >= fromRadix) throw new Error();
				val = val * BigInt(fromRadix) + BigInt(d);
			}
		}
	} catch {
		throw new Error(`Input "${inputStr}" contains invalid characters for base ${fromRadix}.`);
	}
	if (val === BigInt(0)) return "0";
	let result = "";
	while (val > 0) {
		result = CHARSET.BASE36[Number(val % BigInt(toRadix))] + result;
		val = val / BigInt(toRadix);
	}
	return result;
}
function binToHex(s) {
	return convert(s, 2, 16);
}
function hexToBin(s) {
	return convert(s, 16, 2);
}
function digits(len, radix) {
	if (len <= 0) return "";
	if (radix < 2 || radix > 36) throw new Error(`Radix must be an integer between 2 and 36. Received: ${radix}`);
	const cs = CHARSET.BASE36.slice(0, radix);
	if (len === 1) return sample(cs.split(""));
	return sample(cs.replace("0", "").split("")) + string(len - 1, cs);
}
const base = {
	convert,
	binToHex,
	hexToBin,
	digits
};

//#endregion
//#region src/generator/debug.ts
function debug(labelOrData, dataOrOptions, options) {
	let label = null;
	let data;
	let config;
	const defaults = {
		separator: " ",
		printDims: false,
		printType: true,
		printStats: false,
		truncate: 50,
		colors: true
	};
	if (typeof labelOrData === "string") {
		label = labelOrData;
		data = dataOrOptions;
		config = {
			...defaults,
			...options
		};
	} else {
		data = labelOrData;
		config = {
			...defaults,
			...dataOrOptions
		};
	}
	const c = config.colors ? {
		bold: pc.bold,
		cyan: pc.cyan,
		gray: pc.gray,
		magenta: pc.magenta,
		yellow: pc.yellow,
		green: pc.green
	} : {
		bold: (s) => s,
		cyan: (s) => s,
		gray: (s) => s,
		magenta: (s) => s,
		yellow: (s) => s,
		green: (s) => s
	};
	console.log(c.bold(c.cyan(`---[ ${label || "Genesis Debug"} ]`)) + c.gray(" ---"));
	if (data === null || data === void 0) {
		console.log(c.magenta(String(data)));
		console.log(c.gray("------------------------------------"));
		return;
	}
	if (!Array.isArray(data)) {
		if (config.printType) console.log(`${c.yellow("Type:")} ${c.green(typeof data)}`);
		console.log(data);
		console.log(c.gray("------------------------------------"));
		return;
	}
	if (data.length === 0) {
		console.log(c.yellow("Type:") + c.green(" Array (empty)"));
		console.log("[]");
		console.log(c.gray("------------------------------------"));
		return;
	}
	const is2D = Array.isArray(data[0]);
	const isTruncated = data.length > config.truncate;
	const displayData = isTruncated ? data.slice(0, config.truncate) : data;
	if (config.printType) {
		const itemType = is2D ? typeof data[0]?.[0] : typeof data[0];
		const typeStr = is2D ? `Matrix<${itemType}>` : `Array<${itemType}>`;
		const dimsStr = is2D ? `(${data.length}x${data[0].length})` : `(len=${data.length})`;
		console.log(`${c.yellow("Type:")} ${c.green(typeStr)}  ${c.yellow("Dims:")} ${c.green(dimsStr)}`);
	}
	if (config.printStats && typeof data[0] === "number") {
		const flatNums = (is2D ? data.flat() : data).filter((n) => typeof n === "number");
		if (flatNums.length > 0) {
			const stats = {
				min: Math.min(...flatNums),
				max: Math.max(...flatNums),
				sum: flatNums.reduce((a, b) => a + b, 0)
			};
			console.log(`${c.yellow("Stats:")} ${c.gray("min=")}${stats.min} ${c.gray("max=")}${stats.max} ${c.gray("sum=")}${stats.sum}`);
		}
	}
	if (config.printDims) {
		const dims = is2D ? `${data.length}${config.separator}${data[0].length}` : `${data.length}`;
		console.log(c.magenta(dims));
	}
	if (is2D) {
		const matrix$1 = displayData;
		const colWidths = Array(matrix$1[0]?.length || 0).fill(0);
		for (const row of matrix$1) for (let i = 0; i < row.length; i++) {
			const cellStr = String(row[i] ?? "");
			if (cellStr.length > colWidths[i]) colWidths[i] = cellStr.length;
		}
		matrix$1.forEach((row) => {
			const rowStr = row.map((cell, i) => String(cell ?? "").padEnd(colWidths[i], " ")).join(config.separator);
			console.log(rowStr);
		});
	} else console.log(displayData.join(config.separator));
	if (isTruncated) console.log(c.gray(`... (truncated, ${data.length - config.truncate} more items)`));
	console.log(c.gray("------------------------------------"));
}

//#endregion
//#region src/generator/index.ts
/**
* G 对象 — Genesis 数据生成器单例
* 
* 静态导出架构：
* - 所有模块直接导出函数
* - 模块间通过 import * as xxx 相互引用
* - 无工厂函数，无闭包，代码简洁
*/
const G = {
	CHARSET,
	int,
	ints,
	distinctInts,
	float,
	even,
	odd,
	prime,
	coprime,
	divisible,
	sequence,
	string,
	palindrome,
	word,
	words,
	brackets,
	array,
	sorted,
	sparse,
	partition,
	matrix,
	grid01,
	maze,
	intervals,
	permutation,
	chunk: chunk$1,
	shuffle,
	sample,
	withRng,
	resetRng,
	tree,
	graph,
	binaryTree,
	points,
	convexHull,
	polygon,
	isLeap,
	year,
	date,
	base,
	debug
};

//#endregion
//#region src/generator/factory.ts
function createGenerator(seedOrRng) {
	const rng = typeof seedOrRng === "function" ? seedOrRng : createSeededRng(seedOrRng);
	const scoped = (callback) => runWithRng(rng, callback);
	return {
		CHARSET: G.CHARSET,
		int: (min, max) => scoped(() => G.int(min, max)),
		ints: (count, min, max) => scoped(() => G.ints(count, min, max)),
		distinctInts: (count, min, max) => scoped(() => G.distinctInts(count, min, max)),
		float: (min, max, precision) => scoped(() => G.float(min, max, precision)),
		even: (min, max) => scoped(() => G.even(min, max)),
		odd: (min, max) => scoped(() => G.odd(min, max)),
		prime: (min, max) => scoped(() => G.prime(min, max)),
		coprime: (min, max) => scoped(() => G.coprime(min, max)),
		divisible: (min, max, d) => scoped(() => G.divisible(min, max, d)),
		sequence: (options) => scoped(() => G.sequence(options)),
		string: (len, charset) => scoped(() => G.string(len, charset)),
		palindrome: (len, charset) => scoped(() => G.palindrome(len, charset)),
		word: (minLen, maxLen) => scoped(() => G.word(minLen, maxLen)),
		words: (count, minLen, maxLen) => scoped(() => G.words(count, minLen, maxLen)),
		brackets: (n, options) => scoped(() => G.brackets(n, options)),
		array: (count, itemGenerator) => scoped(() => G.array(count, itemGenerator)),
		sorted: (count, min, max, options) => scoped(() => G.sorted(count, min, max, options)),
		sparse: (count, min, max, gap) => scoped(() => G.sparse(count, min, max, gap)),
		partition: (count, sum, options) => scoped(() => G.partition(count, sum, options)),
		matrix: (rows, cols, cellGenerator) => scoped(() => G.matrix(rows, cols, cellGenerator)),
		grid01: (rows, cols, density) => scoped(() => G.grid01(rows, cols, density)),
		maze: (rows, cols, options) => scoped(() => G.maze(rows, cols, options)),
		intervals: (n, min, max, options) => scoped(() => G.intervals(n, min, max, options)),
		permutation: (n, oneBased) => scoped(() => G.permutation(n, oneBased)),
		shuffle: (array$1) => scoped(() => G.shuffle(array$1)),
		sample: ((population, k) => scoped(() => k === void 0 ? G.sample(population) : G.sample(population, k))),
		chunk: (array$1, size) => G.chunk(array$1, size),
		tree: (n, options) => scoped(() => G.tree(n, options)),
		graph: (n, m, options) => scoped(() => G.graph(n, m, options)),
		points: (n, minVal, maxVal, options) => scoped(() => G.points(n, minVal, maxVal, options)),
		convexHull: (n, minVal, maxVal) => scoped(() => G.convexHull(n, minVal, maxVal)),
		polygon: (n, minVal, maxVal) => scoped(() => G.polygon(n, minVal, maxVal)),
		binaryTree: (n, options) => scoped(() => G.binaryTree(n, options)),
		isLeap: (year$1) => G.isLeap(year$1),
		year: (minYear, maxYear) => scoped(() => G.year(minYear, maxYear)),
		date: (options) => scoped(() => G.date(options)),
		base: {
			convert: (input, fromRadix, toRadix) => G.base.convert(input, fromRadix, toRadix),
			binToHex: (s) => G.base.binToHex(s),
			hexToBin: (s) => G.base.hexToBin(s),
			digits: (length, radix) => scoped(() => G.base.digits(length, radix))
		},
		debug: ((...args) => {
			const [labelOrData, dataOrOptions, options] = args;
			if (typeof labelOrData === "string" && args.length >= 2) return G.debug(labelOrData, dataOrOptions, options);
			return G.debug(labelOrData, dataOrOptions);
		})
	};
}
function createSeededRng(seed) {
	const hash = crypto.createHash("sha256").update(String(seed)).digest();
	let a = hash.readUInt32LE(0);
	let b = hash.readUInt32LE(4);
	let c = hash.readUInt32LE(8);
	let d = hash.readUInt32LE(12);
	return () => {
		a >>>= 0;
		b >>>= 0;
		c >>>= 0;
		d >>>= 0;
		const t$1 = a + b | 0;
		a = b ^ b >>> 9;
		b = c + (c << 3) | 0;
		c = c << 21 | c >>> 11;
		d = d + 1 | 0;
		const result = t$1 + d | 0;
		c = c + result | 0;
		return (result >>> 0) / 4294967296;
	};
}

//#endregion
//#region package.json
var version = "2.0.0";

//#endregion
//#region src/language.ts
const LANGUAGES = [
	{
		id: "cpp",
		name: "C++",
		extensions: [
			".cpp",
			".cc",
			".cxx"
		],
		type: "compiled"
	},
	{
		id: "go",
		name: "Go",
		extensions: [".go"],
		type: "compiled"
	},
	{
		id: "rust",
		name: "Rust",
		extensions: [".rs"],
		type: "compiled"
	},
	{
		id: "java",
		name: "Java",
		extensions: [".java"],
		type: "compiled"
	},
	{
		id: "python",
		name: "Python",
		extensions: [".py"],
		type: "interpreted"
	},
	{
		id: "javascript",
		name: "JavaScript",
		extensions: [".js"],
		type: "interpreted"
	},
	{
		id: "typescript",
		name: "TypeScript",
		extensions: [".ts"],
		type: "interpreted"
	}
];
/**
* 根据源文件扩展名检测编程语言。
* @param sourceFile 源文件路径。
* @returns {LanguageInfo | null} 匹配的语言信息，如果未找到则返回 null。
*/
function detectLanguage(sourceFile) {
	const extension = path.extname(sourceFile);
	if (!extension) return null;
	return LANGUAGES.find((lang) => lang.extensions.includes(extension)) || null;
}

//#endregion
//#region src/i18n.ts
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
let translations = {};
function getSystemLocale() {
	const explicitLocale = process.env.GENESIS_LANG;
	if (explicitLocale) return explicitLocale.toLowerCase().startsWith("zh") ? "zh" : "en";
	const lang = process.env.LANG || process.env.LC_MESSAGES || process.env.LC_ALL;
	if (lang && lang.toLowerCase().startsWith("zh")) return "zh";
	if (Intl.DateTimeFormat().resolvedOptions().locale.startsWith("zh")) return "zh";
	return "en";
}
function loadTranslations(locale) {
	const filePath = path.join(__dirname, "locales", `${locale}.json`);
	try {
		const fileContent = fs.readFileSync(filePath, "utf-8");
		translations = JSON.parse(fileContent);
	} catch (error) {
		console.error(`Failed to load translations for locale: ${locale}`, error);
		if (locale !== "en") loadTranslations("en");
	}
}
/**
* 翻译函数。
* 根据当前语言环境获取键对应的翻译文本，并支持参数替换。
* @param key 翻译键。
* @param args 替换参数。
* @returns 翻译后的字符串。
*/
function t(key, ...args) {
	let message = translations[key] || key;
	args.forEach((arg, index) => {
		message = message.replace(`{${index}}`, String(arg));
	});
	return message;
}
loadTranslations(getSystemLocale());

//#endregion
//#region src/execution.ts
const GENESIS_CACHE_DIR = ".genesis";
const CACHE_FILE = path.join(GENESIS_CACHE_DIR, "cache.json");
const DEFAULT_WINDOWS_CPP_STACK_SIZE_BYTES = 16 * 1024 * 1024;
const DEFAULT_COMPILER_FLAGS = {
	cpp: [
		"-O2",
		"-std=c++17",
		"-Wall"
	],
	rust: ["-C", "opt-level=2"]
};
async function prepareForExecution(sourceFile, config) {
	const lang = detectLanguage(sourceFile);
	if (!lang) {
		consola.error(`Unsupported language for file: ${sourceFile}`);
		return null;
	}
	if (lang.type === "interpreted") return handleInterpretedLanguage(sourceFile, lang);
	return handleCompiledLanguage(sourceFile, lang, config);
}
async function handleInterpretedLanguage(sourceFile, lang) {
	let runtime = null;
	switch (lang.id) {
		case "python":
			runtime = await findRuntime(["python3", "python"]);
			break;
		case "javascript":
			runtime = await findRuntime(["node"]);
			break;
		case "typescript":
			runtime = await findRuntime(["tsx"]);
			break;
	}
	if (!runtime) {
		consola.error(`Could not find runtime for ${lang.name}. Please ensure it is installed and in your PATH.`);
		return null;
	}
	return {
		runArgs: [runtime, sourceFile],
		executablePath: sourceFile
	};
}
async function handleCompiledLanguage(sourceFile, lang, config) {
	const compiler = await resolveCompiler(lang, config.compiler);
	if (!compiler) {
		consola.error(getCompilerHelpMessage(lang));
		return null;
	}
	const compilerVersion = await getCompilerVersion(compiler);
	if (compilerVersion) consola.info(t("compilation.usingCompiler", `${compiler.displayName} ${pc.green(compilerVersion)}`));
	else consola.info(t("compilation.usingCompiler", compiler.displayName));
	const profileContext = {
		compilerVersion,
		platform: process.platform,
		arch: process.arch,
		ojProfile: config.ojProfile,
		stackSizeBytes: config.stackSizeBytes
	};
	const profile = await getCompilationProfile(sourceFile, compiler, lang, config.compilerFlags, profileContext);
	const cacheKey = `${sourceFile}-${compiler.displayName}-${process.platform}-${process.arch}`;
	const cachedExecutable = await findCachedExecutable(cacheKey, profile.hash);
	if (cachedExecutable) {
		consola.info(t("compilation.hashMatch", sourceFile));
		return {
			runArgs: getRunCommand(cachedExecutable, sourceFile, lang),
			executablePath: cachedExecutable
		};
	}
	const executablePath = await executeCompilation(sourceFile, compiler, profile, lang, cacheKey);
	if (!executablePath) return null;
	return {
		runArgs: getRunCommand(executablePath, sourceFile, lang),
		executablePath
	};
}
function getRunCommand(executablePath, sourceFile, lang) {
	if (lang.id === "java") return [
		"java",
		"-cp",
		executablePath,
		path.basename(sourceFile, ".java")
	];
	return [executablePath];
}
async function resolveCompiler(lang, userCompiler) {
	if (userCompiler) {
		const parts = splitCommandString(userCompiler);
		if (parts.length === 0) return null;
		const [command$1, ...inlineFlags] = parts;
		return {
			command: command$1,
			inlineFlags,
			displayName: parts.join(" ")
		};
	}
	const command = await findRuntime({
		cpp: ["g++", "clang++"],
		go: ["go"],
		rust: ["rustc"],
		java: ["javac"]
	}[lang.id] || []);
	if (!command) return null;
	return {
		command,
		inlineFlags: [],
		displayName: command
	};
}
async function getCompilationProfile(sourceFile, compiler, lang, userFlags = [], context = {}) {
	const finalFlags = buildCompilerFlags(lang, compiler.command, compiler.inlineFlags, userFlags, context);
	await fs$1.mkdir(GENESIS_CACHE_DIR, { recursive: true });
	const fingerprint = buildCompilationFingerprint(await fs$1.readFile(sourceFile, "utf8"), compiler, finalFlags, context);
	return {
		hash: crypto.createHash("sha256").update(fingerprint).digest("hex"),
		flags: finalFlags
	};
}
function buildCompilationFingerprint(sourceContent, compiler, finalFlags, context = {}) {
	return [
		sourceContent,
		compiler.displayName,
		context.compilerVersion ?? "unknown",
		context.platform ?? process.platform,
		context.arch ?? process.arch,
		finalFlags.join("\0")
	].join("\0");
}
function buildCompilerFlags(lang, compilerCommand, inlineFlags = [], userFlags = [], context = {}) {
	const baseFlags = DEFAULT_COMPILER_FLAGS[lang.id] || [];
	const automaticFlags = getAutomaticCompilerFlags(lang, compilerCommand, [...inlineFlags, ...userFlags], context);
	return [
		...baseFlags,
		...automaticFlags,
		...userFlags
	];
}
function getAutomaticCompilerFlags(lang, compilerCommand, explicitFlags, context = {}) {
	const platform = context.platform ?? process.platform;
	if (lang.id !== "cpp" || platform !== "win32") return [];
	if (hasExplicitWindowsStackFlag(explicitFlags)) return [];
	const stackSizeBytes = resolveDesiredStackSizeBytes(context);
	if (!stackSizeBytes) return [];
	return getWindowsStackFlags(compilerCommand, stackSizeBytes);
}
function resolveDesiredStackSizeBytes(context) {
	if (isValidStackSize(context.stackSizeBytes)) return Math.floor(context.stackSizeBytes);
	const ojProfile = context.ojProfile ?? "auto";
	if (ojProfile === "none" || ojProfile === "windows") return null;
	return DEFAULT_WINDOWS_CPP_STACK_SIZE_BYTES;
}
function isValidStackSize(stackSizeBytes) {
	return typeof stackSizeBytes === "number" && Number.isFinite(stackSizeBytes) && stackSizeBytes > 0;
}
function getWindowsStackFlags(compilerCommand, stackSizeBytes) {
	const toolchain = detectCppToolchain(compilerCommand);
	if (toolchain === "msvc") return ["/link", `/STACK:${stackSizeBytes}`];
	if (toolchain === "gnu") return [`-Wl,--stack,${stackSizeBytes}`];
	return [];
}
function detectCppToolchain(compilerCommand) {
	const compilerName = path.basename(compilerCommand).toLowerCase();
	if (compilerName === "cl" || compilerName === "cl.exe" || compilerName === "clang-cl" || compilerName === "clang-cl.exe") return "msvc";
	if (compilerName === "g++" || compilerName === "g++.exe" || compilerName === "c++" || compilerName === "c++.exe" || compilerName.includes("g++") || compilerName.includes("clang++")) return "gnu";
	return "unknown";
}
function hasExplicitWindowsStackFlag(flags) {
	for (let index = 0; index < flags.length; index++) {
		const current = flags[index]?.toLowerCase() || "";
		const next = flags[index + 1]?.toLowerCase() || "";
		if (isWindowsStackFlag(current)) return true;
		if ((current === "-xlinker" || current === "/link") && isWindowsStackFlag(next)) return true;
	}
	return false;
}
function isWindowsStackFlag(flag) {
	return /(?:^|,)--stack(?:[=,]|$)/.test(flag) || /^\/stack:/.test(flag);
}
function splitCommandString(commandLine) {
	const tokens = [];
	let current = "";
	let quote = null;
	for (let index = 0; index < commandLine.length; index++) {
		const char = commandLine[index];
		const next = commandLine[index + 1];
		if (char === "\\" && next && (next === quote || next === "\"" || next === "'" || next === "\\")) {
			current += next;
			index++;
			continue;
		}
		if (quote) {
			if (char === quote) quote = null;
			else current += char;
			continue;
		}
		if (char === "\"" || char === "'") {
			quote = char;
			continue;
		}
		if (/\s/.test(char)) {
			if (current) {
				tokens.push(current);
				current = "";
			}
			continue;
		}
		current += char;
	}
	if (current) tokens.push(current);
	return tokens;
}
async function findCachedExecutable(cacheKey, currentHash) {
	const entry = (await readCache())[cacheKey];
	if (entry && entry.hash === currentHash) try {
		await fs$1.access(entry.executablePath);
		return entry.executablePath;
	} catch {
		consola.warn(t("compilation.cacheMissing"));
	}
	return null;
}
async function executeCompilation(sourceFile, compiler, profile, lang, cacheKey) {
	const spinner = ora(t("compilation.compiling", sourceFile, compiler.displayName)).start();
	const { command, args, executablePath } = getCompilationCommand(sourceFile, compiler, profile.flags, lang, profile.hash);
	try {
		if (lang.id === "java") await fs$1.mkdir(executablePath, { recursive: true });
		await execa(command, args);
		spinner.succeed(t("compilation.compiled", sourceFile));
		await updateCache(cacheKey, profile.hash, executablePath);
		return executablePath;
	} catch (error) {
		spinner.fail(t("compilation.compileFailed", sourceFile));
		const { formatCompilerError } = await import("./error-formatter-3DUz7fOl.mjs");
		consola.error(formatCompilerError(error.stderr || error.message, sourceFile));
		return null;
	}
}
function getCompilationCommand(sourceFile, compiler, flags, lang, hash) {
	const baseName = path.parse(sourceFile).name;
	const hashSuffix = hash.substring(0, 8);
	if (lang.id === "java") {
		const outputDir = path.join(GENESIS_CACHE_DIR, `${baseName}-${hashSuffix}`);
		return {
			command: compiler.command,
			args: [
				...compiler.inlineFlags,
				...flags,
				"-d",
				outputDir,
				sourceFile
			],
			executablePath: outputDir
		};
	}
	const exeSuffix = process.platform === "win32" ? ".exe" : "";
	const executablePath = path.join(GENESIS_CACHE_DIR, `${baseName}-${hashSuffix}${exeSuffix}`);
	if (lang.id === "go") return {
		command: compiler.command,
		args: [
			...compiler.inlineFlags,
			"build",
			...flags,
			"-o",
			executablePath,
			sourceFile
		],
		executablePath
	};
	return {
		command: compiler.command,
		args: [
			...compiler.inlineFlags,
			sourceFile,
			"-o",
			executablePath,
			...flags
		],
		executablePath
	};
}
async function readCache() {
	try {
		return JSON.parse(await fs$1.readFile(CACHE_FILE, "utf-8"));
	} catch {
		return {};
	}
}
async function updateCache(cacheKey, hash, executablePath) {
	const cache = await readCache();
	cache[cacheKey] = {
		hash,
		executablePath
	};
	await fs$1.writeFile(CACHE_FILE, JSON.stringify(cache, null, 2));
}
async function findRuntime(commands) {
	for (const cmd of commands) try {
		if (cmd === "go") await execa(cmd, ["version"]);
		else try {
			await execa(cmd, ["--version"]);
		} catch {
			await execa(cmd, ["-v"]);
		}
		return cmd;
	} catch {}
	return null;
}
async function getCompilerVersion(compiler) {
	try {
		let stdout;
		const compilerName = path.basename(compiler.command).toLowerCase();
		if (compilerName === "go" || compilerName === "go.exe") {
			stdout = (await execa(compiler.command, [...compiler.inlineFlags, "version"])).stdout;
			return stdout.match(/go(\d+\.\d+\.\d+)/)?.[1] ?? null;
		}
		if (compilerName === "javac" || compilerName === "javac.exe") {
			const result = await execa(compiler.command, [...compiler.inlineFlags, "-version"]);
			stdout = result.stdout || result.stderr;
			return stdout.match(/javac\s+(\S+)/)?.[1] ?? null;
		}
		if (compilerName === "rustc" || compilerName === "rustc.exe") {
			stdout = (await execa(compiler.command, [...compiler.inlineFlags, "--version"])).stdout;
			return stdout.match(/rustc\s+(\S+)/)?.[1] ?? null;
		}
		if (compilerName === "cl" || compilerName === "cl.exe") {
			const result = await execa(compiler.command, [...compiler.inlineFlags], { reject: false });
			stdout = `${result.stdout}\n${result.stderr}`;
			return stdout.match(/version\s+(\S+)/i)?.[1] ?? null;
		}
		stdout = (await execa(compiler.command, [...compiler.inlineFlags, "--version"])).stdout;
		return stdout.match(/(\d+\.\d+\.\d+|\d+\.\d+)/)?.[1] ?? null;
	} catch {
		return null;
	}
}
function getCompilerHelpMessage(lang) {
	const platform = process.platform;
	const langCommands = {
		cpp: {
			win32: "pacman -S --needed base-devel mingw-w64-ucrt-x86_64-toolchain",
			darwin: "xcode-select --install",
			linux: "sudo apt update && sudo apt install build-essential"
		},
		go: { default: "https://golang.org/doc/install" },
		rust: { default: "curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh" },
		java: {
			linux: "sudo apt install default-jdk",
			darwin: "brew install openjdk",
			default: "https://adoptium.net/"
		}
	}[lang.id] || {};
	const command = langCommands[platform] || langCommands.linux || langCommands.default || "";
	let message = `\n${t("compiler.notFoundNew", lang.name)}\n\n`;
	message += `${t("compiler.installHint")}\n\n`;
	if (command.startsWith("http")) message += `${t("compiler.installGuideLink", pc.green(command))}\n`;
	else {
		message += `${t("compiler.copyCommand")}\n\n`;
		message += `   ${pc.green(command)}\n`;
	}
	return message;
}

//#endregion
//#region src/dataset-runner.ts
async function loadDatasetFromFile(entryFile = "make.ts") {
	const resolvedPath = path.resolve(entryFile);
	const moduleUrl = pathToFileURL(resolvedPath).href;
	const candidate = resolveDatasetExport(await importDatasetModule(resolvedPath, moduleUrl));
	if (!isDataset(candidate)) throw new Error(`Default export in '${entryFile}' is not a Genesis v2 dataset.`);
	return candidate;
}
function resolveDatasetExport(module) {
	let candidate = module?.default ?? module;
	for (let depth = 0; depth < 3 && !isDataset(candidate); depth++) {
		if (!candidate || typeof candidate !== "object" || !("default" in candidate)) break;
		candidate = candidate.default;
	}
	return candidate;
}
async function importDatasetModule(resolvedPath, moduleUrl) {
	const extension = path.extname(resolvedPath).toLowerCase();
	if (extension === ".ts" || extension === ".tsx" || extension === ".mts" || extension === ".cts") {
		if (process.versions.bun) return import(moduleUrl);
		const { tsImport } = await import("tsx/esm/api");
		return tsImport(moduleUrl, { parentURL: import.meta.url });
	}
	return import(moduleUrl);
}
async function validateDatasetFromFile(entryFile = "make.ts") {
	return validateDataset(await loadDatasetFromFile(entryFile), { datasetFile: path.resolve(entryFile) });
}
async function generateDatasetFromFile(entryFile = "make.ts") {
	return generateDataset(await loadDatasetFromFile(entryFile), { datasetFile: path.resolve(entryFile) });
}
async function replayDatasetFromFile(entryFile = "make.ts", selector) {
	return replayDataset(await loadDatasetFromFile(entryFile), selector, { datasetFile: path.resolve(entryFile) });
}
async function validateDataset(dataset, options = {}) {
	return runDataset(dataset, {
		...options,
		mode: "validate"
	});
}
async function generateDataset(dataset, options = {}) {
	return runDataset(dataset, {
		...options,
		mode: "generate"
	});
}
async function replayDataset(dataset, selector, options = {}) {
	assertDataset(dataset);
	const rootDir = getDatasetRootDir(options.datasetFile);
	const config = resolveConfigPaths(normalizeConfig(dataset.config), options.datasetFile);
	const selected = selectReplayCase(expandDatasetCases(config), selector);
	const replayOutputDir = selector.outputDir ? resolvePathFromRoot(selector.outputDir, rootDir) : path.join(config.outputDir ?? "data", "replay");
	const replayManifestPath = selector.manifestPath === false ? false : selector.manifestPath ? resolvePathFromRoot(selector.manifestPath, rootDir) : config.manifestPath === false ? false : path.join(replayOutputDir, `${selected.caseNumber}.manifest.json`);
	const startedAt = Date.now();
	const runConfig = {
		...config,
		outputDir: replayOutputDir,
		manifestPath: replayManifestPath
	};
	const { results, execution } = await runCasePipeline(runConfig, [selected], "generate", {
		cleanOutputDir: false,
		outputDir: replayOutputDir,
		rootDir
	});
	const summary = summarize(results, Date.now() - startedAt);
	const replay = {
		caseNumber: selected.caseNumber,
		caseName: selected.name,
		repeatIndex: selected.repeatIndex,
		outputDir: path.resolve(replayOutputDir)
	};
	return {
		manifest: await writeManifest(runConfig, results, summary, {
			datasetFile: options.datasetFile ?? null,
			execution,
			replay
		}),
		results,
		summary
	};
}
function expandDatasetCases(config) {
	const expanded = [];
	let caseIndex = 0;
	for (const item of config.cases) {
		if (!item || typeof item !== "object") throw new Error("Every dataset case must be an object.");
		if (!item.name || typeof item.name !== "string") throw new Error("Every dataset case must have a non-empty name.");
		const hasInput = Object.prototype.hasOwnProperty.call(item, "input");
		if (hasInput === (typeof item.generate === "function")) throw new Error(`Case '${item.name}' must define exactly one of input or generate.`);
		const tags = normalizeTags(item.tags);
		if (hasInput) {
			if (Object.prototype.hasOwnProperty.call(item, "repeat")) throw new Error(`Static case '${item.name}' must not define repeat.`);
			expanded.push({
				caseIndex,
				caseNumber: (config.startFrom ?? 1) + caseIndex,
				name: item.name,
				repeatIndex: 0,
				repeatTotal: 1,
				tags,
				kind: "static",
				input: item.input,
				seed: ""
			});
			caseIndex++;
			continue;
		}
		const repeat = item.repeat ?? 1;
		if (!Number.isInteger(repeat) || repeat <= 0) throw new Error(`Case '${item.name}' repeat must be a positive integer.`);
		for (let repeatIndex = 0; repeatIndex < repeat; repeatIndex++) {
			expanded.push({
				caseIndex,
				caseNumber: (config.startFrom ?? 1) + caseIndex,
				name: item.name,
				repeatIndex,
				repeatTotal: repeat,
				tags,
				kind: "generated",
				generate: item.generate,
				seed: ""
			});
			caseIndex++;
		}
	}
	return expanded.map((entry) => ({
		...entry,
		seed: deriveCaseSeed(config.seed, entry.caseIndex, entry.caseNumber, entry.name, entry.repeatIndex)
	}));
}
function selectReplayCase(cases, selector) {
	if (selector.caseNumber !== void 0) {
		const matched = cases.find((item) => item.caseNumber === selector.caseNumber);
		if (!matched) throw new Error(`No dataset case has caseNumber ${selector.caseNumber}.`);
		return matched;
	}
	if (selector.caseName) {
		const repeatIndex = selector.repeatIndex ?? 0;
		const matched = cases.find((item) => item.name === selector.caseName && item.repeatIndex === repeatIndex);
		if (!matched) throw new Error(`No dataset case matches name '${selector.caseName}' with repeatIndex ${repeatIndex}.`);
		return matched;
	}
	throw new Error("Replay requires either caseNumber or caseName.");
}
async function runDataset(dataset, options) {
	assertDataset(dataset);
	const rootDir = getDatasetRootDir(options.datasetFile);
	const config = resolveConfigPaths(normalizeConfig({
		...dataset.config,
		outputDir: options.outputDir ?? dataset.config.outputDir,
		manifestPath: options.manifestPath ?? dataset.config.manifestPath
	}), options.datasetFile);
	const cases = expandDatasetCases(config);
	if (cases.length === 0) throw new Error("Dataset contains no cases.");
	const startedAt = Date.now();
	const { results, execution } = await runCasePipeline(config, cases, options.mode, {
		cleanOutputDir: options.cleanOutputDir,
		outputDir: config.outputDir,
		rootDir
	});
	const summary = summarize(results, Date.now() - startedAt);
	return {
		manifest: options.mode === "generate" ? await writeManifest(config, results, summary, {
			datasetFile: options.datasetFile ?? null,
			execution,
			replay: options.replay ?? null
		}) : null,
		results,
		summary
	};
}
function assertDataset(dataset) {
	if (!dataset || typeof dataset !== "object" || dataset.__genesisDataset !== 2) throw new Error("Invalid Genesis v2 dataset object.");
}
function normalizeConfig(config) {
	if (!config || typeof config !== "object") throw new Error("Dataset config is missing.");
	if (!config.solution || typeof config.solution !== "string") throw new Error("Dataset config.solution must be a non-empty string.");
	if (typeof config.format !== "function") throw new Error("Dataset config.format must be a function.");
	if (!Array.isArray(config.cases)) throw new Error("Dataset config.cases must be an array.");
	if (config.seed === void 0 || config.seed === null || config.seed === "") throw new Error("Dataset config.seed is required.");
	return {
		...config,
		outputDir: config.outputDir ?? "data",
		startFrom: Number.isInteger(config.startFrom) && (config.startFrom ?? 1) > 0 ? config.startFrom : 1,
		runTimeoutMs: Number.isFinite(config.runTimeoutMs) && (config.runTimeoutMs ?? 1e4) > 0 ? config.runTimeoutMs : 1e4,
		caseConcurrency: Number.isFinite(config.caseConcurrency) && (config.caseConcurrency ?? 0) > 0 ? config.caseConcurrency : void 0,
		compilerFlags: [...config.compilerFlags ?? []],
		manifestPath: config.manifestPath ?? void 0
	};
}
function resolveConfigPaths(config, datasetFile) {
	if (!datasetFile) return config;
	const rootDir = getDatasetRootDir(datasetFile);
	return {
		...config,
		solution: resolvePathFromRoot(config.solution, rootDir),
		outputDir: resolvePathFromRoot(config.outputDir ?? "data", rootDir),
		manifestPath: typeof config.manifestPath === "string" ? resolvePathFromRoot(config.manifestPath, rootDir) : config.manifestPath
	};
}
async function runCasePipeline(config, cases, mode, options = {}) {
	const preparedExecution = mode === "generate" ? await prepareDatasetExecution(config) : null;
	const outputDir = path.resolve(options.outputDir ?? config.outputDir ?? "data");
	const rootDir = path.resolve(options.rootDir ?? process.cwd());
	if (mode === "generate" && options.cleanOutputDir !== false) {
		await resetOutputDirectory(outputDir, rootDir);
		await fs$1.mkdir(outputDir, { recursive: true });
	}
	if (mode === "generate") await fs$1.mkdir(outputDir, { recursive: true });
	const concurrency = resolveConcurrency(config.caseConcurrency, cases.length);
	const results = new Array(cases.length);
	let nextIndex = 0;
	const running = /* @__PURE__ */ new Set();
	const launch = (index) => {
		const task = processCase(config, cases[index], mode, preparedExecution, outputDir).then((result) => {
			results[index] = result;
		}).finally(() => {
			running.delete(task);
		});
		running.add(task);
	};
	while (nextIndex < cases.length || running.size > 0) {
		while (nextIndex < cases.length && running.size < concurrency) {
			launch(nextIndex);
			nextIndex++;
		}
		if (running.size > 0) await Promise.race(running);
	}
	return {
		results,
		execution: preparedExecution
	};
}
async function processCase(config, entry, mode, execution, outputDir) {
	const startedAt = Date.now();
	const phases = {
		materializeMs: 0,
		formatMs: 0,
		validateMs: 0,
		writeInputMs: 0,
		executionMs: 0,
		writeOutputMs: 0
	};
	let currentPhase = "materialize";
	let validationSummary = {
		status: "not-run",
		durationMs: 0
	};
	let inputRecord = null;
	let outputRecord = null;
	try {
		currentPhase = "materialize";
		const materializeStarted = Date.now();
		const input = entry.kind === "static" ? entry.input : await entry.generate(buildGenerateContext(entry));
		phases.materializeMs = Date.now() - materializeStarted;
		currentPhase = "format";
		const formatStarted = Date.now();
		const renderedInput = renderFormatDocument(normalizeFormat(config.format(input)));
		phases.formatMs = Date.now() - formatStarted;
		currentPhase = "validate";
		const validationStarted = Date.now();
		validationSummary = await runValidation(config, input, {
			caseIndex: entry.caseIndex,
			caseNumber: entry.caseNumber,
			caseName: entry.name,
			repeatIndex: entry.repeatIndex,
			tags: entry.tags,
			seed: entry.seed,
			formattedInput: renderedInput
		});
		phases.validateMs = Date.now() - validationStarted;
		if (validationSummary.status === "failed") return buildFailedRecord(entry, phases, startedAt, {
			phase: "validate",
			kind: "validation",
			message: validationSummary.reason || "Validation failed."
		}, validationSummary);
		if (mode === "validate") return buildSuccessRecord(entry, phases, startedAt, null, null, validationSummary);
		const inPath = path.join(outputDir, `${entry.caseNumber}.in`);
		const outPath = path.join(outputDir, `${entry.caseNumber}.out`);
		currentPhase = "write-input";
		const writeInputStarted = Date.now();
		inputRecord = await writeTextFile(inPath, renderedInput);
		phases.writeInputMs = Date.now() - writeInputStarted;
		if (!execution) throw new Error("Execution environment is not available.");
		currentPhase = "execution";
		const executionStarted = Date.now();
		await runSolution(execution, renderedInput, config.runTimeoutMs ?? 1e4, outPath);
		phases.executionMs = Date.now() - executionStarted;
		currentPhase = "write-output";
		const writeOutputStarted = Date.now();
		outputRecord = await describeFile(outPath);
		phases.writeOutputMs = Date.now() - writeOutputStarted;
		return {
			caseId: entry.caseNumber,
			caseNumber: entry.caseNumber,
			name: entry.name,
			repeatIndex: entry.repeatIndex,
			tags: entry.tags,
			seed: entry.seed,
			status: "success",
			durationMs: Date.now() - startedAt,
			phases,
			validation: validationSummary,
			input: inputRecord,
			output: outputRecord,
			error: null
		};
	} catch (error) {
		return buildFailedRecord(entry, phases, startedAt, classifyError(error, currentPhase), validationSummary, inputRecord, outputRecord);
	}
}
function buildGenerateContext(entry) {
	return {
		caseIndex: entry.caseIndex,
		caseNumber: entry.caseNumber,
		caseName: entry.name,
		repeatIndex: entry.repeatIndex,
		seed: entry.seed,
		g: createGenerator(entry.seed)
	};
}
async function runValidation(config, input, context) {
	if (!config.validate) return {
		status: "not-run",
		durationMs: 0
	};
	const startedAt = Date.now();
	try {
		const normalized = normalizeValidationResult(await config.validate(input, context));
		normalized.durationMs = Date.now() - startedAt;
		return normalized;
	} catch (error) {
		return {
			status: "failed",
			durationMs: Date.now() - startedAt,
			reason: getErrorMessage(error)
		};
	}
}
function normalizeValidationResult(result) {
	if (result === void 0 || result === true) return {
		status: "passed",
		durationMs: 0
	};
	if (result === false) return {
		status: "failed",
		durationMs: 0,
		reason: "Validation returned false."
	};
	if (typeof result === "string") return {
		status: "failed",
		durationMs: 0,
		reason: result
	};
	if (result && typeof result === "object") return result.ok ? {
		status: "passed",
		durationMs: 0
	} : {
		status: "failed",
		durationMs: 0,
		reason: result.reason || "Validation failed."
	};
	return {
		status: "failed",
		durationMs: 0,
		reason: "Validation returned an unsupported value."
	};
}
function buildSuccessRecord(entry, phases, startedAt, input, output, validation) {
	return {
		caseId: entry.caseNumber,
		caseNumber: entry.caseNumber,
		name: entry.name,
		repeatIndex: entry.repeatIndex,
		tags: entry.tags,
		seed: entry.seed,
		status: "success",
		durationMs: Date.now() - startedAt,
		phases,
		validation,
		input,
		output,
		error: null
	};
}
function buildFailedRecord(entry, phases, startedAt, error, validation, input = null, output = null) {
	return {
		caseId: entry.caseNumber,
		caseNumber: entry.caseNumber,
		name: entry.name,
		repeatIndex: entry.repeatIndex,
		tags: entry.tags,
		seed: entry.seed,
		status: "failure",
		durationMs: Date.now() - startedAt,
		phases,
		validation,
		input,
		output,
		error
	};
}
function classifyError(error, phase) {
	const message = getErrorMessage(error);
	if (error instanceof Error && /timeout/i.test(error.message)) return {
		phase: "execution",
		kind: "timeout",
		message
	};
	if (phase === "format") return {
		phase,
		kind: "formatter",
		message
	};
	if (phase === "validate") return {
		phase,
		kind: "validation",
		message
	};
	if (phase === "write-input" || phase === "write-output" || phase === "manifest") return {
		phase,
		kind: "io",
		message
	};
	if (phase === "execution") return {
		phase,
		kind: "execution",
		message
	};
	if (phase === "config") return {
		phase,
		kind: "config",
		message
	};
	return {
		phase,
		kind: "generator",
		message
	};
}
function normalizeTags(tags) {
	return Array.from(new Set((tags ?? []).filter(Boolean)));
}
function deriveCaseSeed(seed, caseIndex, caseNumber, name, repeatIndex) {
	return crypto.createHash("sha256").update(JSON.stringify({
		seed: String(seed),
		caseIndex,
		caseNumber,
		name,
		repeatIndex
	})).digest("hex");
}
function summarize(results, durationMs) {
	const succeeded = results.filter((result) => result.status === "success").length;
	return {
		totalCases: results.length,
		succeeded,
		failed: results.length - succeeded,
		durationMs
	};
}
async function writeManifest(config, results, summary, context = {}) {
	const manifestPath = resolveManifestPath(config);
	if (!manifestPath) return null;
	const manifest = {
		version: 2,
		tool: {
			name: "genesis-kit",
			version
		},
		generatedAt: (/* @__PURE__ */ new Date()).toISOString(),
		dataset: {
			modulePath: context.datasetFile ? toProjectRelativePosix(path.resolve(context.datasetFile)) : null,
			solution: toProjectRelativePosix(path.resolve(config.solution)),
			outputDir: toProjectRelativePosix(path.resolve(config.outputDir ?? "data")),
			seed: String(config.seed),
			startFrom: config.startFrom ?? 1,
			runTimeoutMs: config.runTimeoutMs ?? 1e4,
			caseConcurrency: config.caseConcurrency ?? null,
			compiler: config.compiler ?? null,
			compilerFlags: [...config.compilerFlags ?? []],
			ojProfile: config.ojProfile ?? null,
			stackSizeBytes: config.stackSizeBytes ?? null,
			manifestPath: manifestPath ? toProjectRelativePosix(manifestPath) : null
		},
		execution: context.execution ? {
			runArgs: [...context.execution.runArgs],
			executablePath: context.execution.executablePath,
			fingerprint: buildExecutionFingerprint(context.execution)
		} : null,
		replay: context.replay ?? null,
		summary,
		cases: results
	};
	await fs$1.mkdir(path.dirname(manifestPath), { recursive: true });
	await fs$1.writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf8");
	return manifest;
}
function buildExecutionFingerprint(execution) {
	return crypto.createHash("sha256").update(JSON.stringify({
		runArgs: execution.runArgs,
		executablePath: execution.executablePath
	})).digest("hex");
}
function resolveManifestPath(config) {
	if (config.manifestPath === false) return null;
	if (typeof config.manifestPath === "string") return path.resolve(config.manifestPath);
	const outputDir = path.resolve(config.outputDir ?? "data");
	const parentDir = path.dirname(outputDir);
	const name = path.basename(outputDir) || "data";
	return path.join(parentDir, `${name}.manifest.json`);
}
function toPortablePath(filePath) {
	return filePath.split(path.sep).join(path.posix.sep).replaceAll(path.win32.sep, path.posix.sep);
}
function toProjectRelativePosix(filePath) {
	const absolutePath = path.resolve(filePath);
	const relativePath = path.relative(process.cwd(), absolutePath);
	if (relativePath && !relativePath.startsWith("..") && !path.isAbsolute(relativePath)) return toPortablePath(relativePath);
	return toPortablePath(absolutePath);
}
function getDatasetRootDir(datasetFile) {
	return datasetFile ? path.dirname(path.resolve(datasetFile)) : process.cwd();
}
function resolvePathFromRoot(filePath, rootDir) {
	return path.isAbsolute(filePath) ? filePath : path.resolve(rootDir, filePath);
}
async function prepareDatasetExecution(config) {
	const result = await prepareForExecution(path.resolve(config.solution), {
		compiler: config.compiler,
		compilerFlags: config.compilerFlags,
		ojProfile: config.ojProfile,
		stackSizeBytes: config.stackSizeBytes
	});
	if (!result) throw new Error("Failed to prepare standard solution for execution.");
	return result;
}
async function runSolution(execution, input, timeoutMs, outputPath) {
	const [command, ...args] = execution.runArgs;
	const tempOutputPath = path.join(path.dirname(outputPath), `.${path.basename(outputPath)}.${process.pid}.${crypto.randomUUID()}.tmp`);
	try {
		const result = await execa(command, args, {
			input,
			timeout: timeoutMs,
			reject: false,
			cleanup: true,
			buffer: {
				stdout: false,
				stderr: true
			},
			stripFinalNewline: {
				stdout: false,
				stderr: true
			},
			stdout: { file: tempOutputPath }
		});
		if (result.timedOut) throw new Error(`Execution timed out after ${timeoutMs}ms.`);
		if (result.exitCode !== 0) throw new Error(result.stderr || `Command failed with exit code ${result.exitCode}.`);
		await fs$1.rm(outputPath, { force: true });
		await fs$1.rename(tempOutputPath, outputPath);
	} catch (error) {
		await fs$1.rm(tempOutputPath, { force: true });
		throw error;
	}
}
async function writeTextFile(filePath, text) {
	await fs$1.mkdir(path.dirname(filePath), { recursive: true });
	await fs$1.writeFile(filePath, text, "utf8");
	return describeFile(filePath);
}
async function describeFile(filePath) {
	const stat = await fs$1.stat(filePath);
	const sha256 = crypto.createHash("sha256");
	let newlineCount = 0;
	await new Promise((resolve, reject) => {
		const stream = createReadStream(filePath);
		stream.on("data", (chunk$2) => {
			sha256.update(chunk$2);
			for (const byte of chunk$2) if (byte === 10) newlineCount++;
		});
		stream.once("error", reject);
		stream.once("end", () => resolve());
	});
	return {
		path: toProjectRelativePosix(filePath),
		sha256: sha256.digest("hex"),
		bytes: stat.size,
		lines: stat.size === 0 ? 0 : newlineCount + 1
	};
}
async function resetOutputDirectory(outputDir, rootDir) {
	if ([
		"src",
		"node_modules",
		".git",
		".",
		"..",
		"/"
	].includes(path.basename(outputDir))) throw new Error(`Safety check failed: refusing to remove '${outputDir}'.`);
	const absoluteOutputDir = path.resolve(outputDir);
	const absoluteRootDir = path.resolve(rootDir);
	const relativePath = path.relative(absoluteRootDir, absoluteOutputDir);
	if (absoluteOutputDir === absoluteRootDir || relativePath.startsWith("..") || path.isAbsolute(relativePath)) throw new Error(`Safety check failed: outputDir '${outputDir}' must be inside '${absoluteRootDir}'.`);
	await fs$1.rm(absoluteOutputDir, {
		recursive: true,
		force: true
	});
}
function resolveConcurrency(caseConcurrency, totalCases) {
	const preferred = caseConcurrency ?? os.cpus().length;
	if (!Number.isFinite(preferred) || preferred <= 0) return 1;
	return Math.max(1, Math.min(totalCases, Math.floor(preferred)));
}
function getErrorMessage(error) {
	if (error instanceof Error && error.message) return error.message;
	return String(error);
}

//#endregion
//#region src/ai-contract.generated.ts
const AI_CONTRACT_GENERATED = {
	"headerDeclarations": [
		{
			"name": "SeedInput",
			"declarationLines": ["export type SeedInput = string | number | bigint;"]
		},
		{
			"name": "OjProfile",
			"declarationLines": ["export type OjProfile = 'auto' | 'linux' | 'windows' | 'none';"]
		},
		{
			"name": "MaybePromise",
			"declarationLines": ["export type MaybePromise<T> = T | Promise<T>;"]
		},
		{
			"name": "DebugOptions",
			"declarationLines": [
				"export interface DebugOptions {",
				"    separator?: string;",
				"    printDims?: boolean;",
				"    printType?: boolean;",
				"    printStats?: boolean;",
				"    truncate?: number;",
				"    colors?: boolean;",
				"}"
			]
		},
		{
			"name": "WeightOption",
			"declarationLines": [
				"export type WeightOption = boolean | [",
				"    min: number,",
				"    max: number",
				"];"
			]
		},
		{
			"name": "GraphType",
			"declarationLines": ["export type GraphType = 'simple' | 'tree' | 'dag' | 'bipartite' | 'wheel' | 'complete';"]
		},
		{
			"name": "GraphOptions",
			"declarationLines": [
				"export interface GraphOptions {",
				"    type?: GraphType;",
				"    directed?: boolean;",
				"    weighted?: WeightOption;",
				"    connected?: boolean;",
				"    noSelfLoops?: boolean;",
				"    oneBased?: boolean;",
				"    negativeCycle?: boolean;",
				"}"
			]
		},
		{
			"name": "TreeType",
			"declarationLines": ["export type TreeType = 'random' | 'path' | 'star';"]
		},
		{
			"name": "TreeOptions",
			"declarationLines": [
				"export interface TreeOptions {",
				"    type?: TreeType;",
				"    weighted?: WeightOption;",
				"    oneBased?: boolean;",
				"}"
			]
		},
		{
			"name": "BinaryTreeType",
			"declarationLines": ["export type BinaryTreeType = 'random' | 'complete' | 'skewed';"]
		},
		{
			"name": "BinaryTreeOptions",
			"declarationLines": [
				"export interface BinaryTreeOptions {",
				"    type?: BinaryTreeType;",
				"    oneBased?: boolean;",
				"}"
			]
		},
		{
			"name": "SequenceOptions",
			"declarationLines": [
				"export type SequenceOptions = {",
				"    type: 'arithmetic';",
				"    start: number;",
				"    diff: number;",
				"    count: number;",
				"} | {",
				"    type: 'geometric';",
				"    start: number;",
				"    ratio: number;",
				"    count: number;",
				"} | {",
				"    type: 'fibonacci';",
				"    count: number;",
				"    first?: number;",
				"    second?: number;",
				"} | {",
				"    type: 'custom';",
				"    init: number[];",
				"    fn: (prev: number[]) => number;",
				"    count: number;",
				"};"
			]
		},
		{
			"name": "FormatAtom",
			"declarationLines": ["export type FormatAtom = string | number | bigint | boolean | null | undefined;"]
		},
		{
			"name": "FormatLine",
			"declarationLines": [
				"export interface FormatLine {",
				"    readonly kind: 'line';",
				"    readonly items: readonly FormatAtom[];",
				"}"
			]
		},
		{
			"name": "FormatTable",
			"declarationLines": [
				"export interface FormatTable {",
				"    readonly kind: 'table';",
				"    readonly rows: readonly (readonly FormatAtom[])[];",
				"}"
			]
		},
		{
			"name": "FormatGrid",
			"declarationLines": [
				"export interface FormatGrid {",
				"    readonly kind: 'grid';",
				"    readonly rows: readonly (string | readonly FormatAtom[])[];",
				"}"
			]
		},
		{
			"name": "FormatRaw",
			"declarationLines": [
				"export interface FormatRaw {",
				"    readonly kind: 'raw';",
				"    readonly text: string;",
				"}"
			]
		},
		{
			"name": "FormatNode",
			"declarationLines": ["export type FormatNode = FormatLine | FormatTable | FormatGrid | FormatRaw;"]
		},
		{
			"name": "FormatDocument",
			"declarationLines": [
				"export interface FormatDocument {",
				"    readonly __genesisFormat: 2;",
				"    readonly nodes: readonly FormatNode[];",
				"}"
			]
		}
	],
	"datasetDeclarations": [
		{
			"name": "DatasetGenerateContext",
			"declarationLines": [
				"export interface DatasetGenerateContext {",
				"    caseIndex: number;",
				"    caseNumber: number;",
				"    caseName: string;",
				"    repeatIndex: number;",
				"    seed: string;",
				"    g: DatasetGenerator;",
				"}"
			]
		},
		{
			"name": "DatasetValidationContext",
			"declarationLines": [
				"export interface DatasetValidationContext {",
				"    caseIndex: number;",
				"    caseNumber: number;",
				"    caseName: string;",
				"    repeatIndex: number;",
				"    tags: string[];",
				"    seed: string;",
				"    formattedInput: string;",
				"}"
			]
		},
		{
			"name": "DatasetValidationResult",
			"declarationLines": [
				"export interface DatasetValidationResult {",
				"    ok: boolean;",
				"    reason?: string;",
				"}"
			]
		},
		{
			"name": "DatasetValidationReturn",
			"declarationLines": ["export type DatasetValidationReturn = void | boolean | string | DatasetValidationResult;"]
		},
		{
			"name": "DatasetStaticCase",
			"declarationLines": [
				"export interface DatasetStaticCase<TInput> {",
				"    name: string;",
				"    tags?: string[];",
				"    input: TInput;",
				"    generate?: never;",
				"    repeat?: never;",
				"}"
			]
		},
		{
			"name": "DatasetGeneratedCase",
			"declarationLines": [
				"export interface DatasetGeneratedCase<TInput> {",
				"    name: string;",
				"    tags?: string[];",
				"    repeat?: number;",
				"    generate(ctx: DatasetGenerateContext): MaybePromise<TInput>;",
				"    input?: never;",
				"}"
			]
		},
		{
			"name": "DatasetCase",
			"declarationLines": ["export type DatasetCase<TInput> = DatasetStaticCase<TInput> | DatasetGeneratedCase<TInput>;"]
		},
		{
			"name": "DatasetConfig",
			"declarationLines": [
				"export interface DatasetConfig<TInput> {",
				"    solution: string;",
				"    outputDir?: string;",
				"    seed: SeedInput;",
				"    startFrom?: number;",
				"    runTimeoutMs?: number;",
				"    caseConcurrency?: number;",
				"    compiler?: string;",
				"    compilerFlags?: string[];",
				"    ojProfile?: OjProfile;",
				"    stackSizeBytes?: number;",
				"    manifestPath?: string | false;",
				"    format(input: TInput): FormatDocument | FormatNode;",
				"    validate?(input: TInput, context: DatasetValidationContext): MaybePromise<DatasetValidationReturn>;",
				"    cases: DatasetCase<TInput>[];",
				"}"
			]
		},
		{
			"name": "Dataset",
			"declarationLines": [
				"export interface Dataset<TInput = unknown> {",
				"    readonly __genesisDataset: 2;",
				"    readonly config: DatasetConfig<TInput>;",
				"}"
			]
		},
		{
			"name": "defineDataset",
			"declarationLines": ["export function defineDataset<TInput>(config: DatasetConfig<TInput>): Dataset<TInput>;"]
		}
	],
	"fmtMethods": [
		{
			"name": "line",
			"signature": "line(...items: FormatAtom[]): FormatLine;",
			"declarationLines": ["line(...items: FormatAtom[]): FormatLine;"]
		},
		{
			"name": "lines",
			"signature": "lines(...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]): FormatDocument;",
			"declarationLines": ["lines(...rows: (FormatNode | readonly FormatAtom[] | FormatAtom)[]): FormatDocument;"]
		},
		{
			"name": "table",
			"signature": "table(rows: readonly (readonly FormatAtom[])[]): FormatTable;",
			"declarationLines": ["table(rows: readonly (readonly FormatAtom[])[]): FormatTable;"]
		},
		{
			"name": "grid",
			"signature": "grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;",
			"declarationLines": ["grid(rows: readonly (string | readonly FormatAtom[])[]): FormatGrid;"]
		},
		{
			"name": "raw",
			"signature": "raw(text: string): FormatRaw;",
			"declarationLines": ["raw(text: string): FormatRaw;"]
		}
	],
	"generatorMethods": [
		{
			"name": "int",
			"signature": "int(min: number, max: number): number;",
			"declarationLines": ["int(min: number, max: number): number;"]
		},
		{
			"name": "ints",
			"signature": "ints(count: number, min: number, max: number): number[];",
			"declarationLines": ["ints(count: number, min: number, max: number): number[];"]
		},
		{
			"name": "distinctInts",
			"signature": "distinctInts(count: number, min: number, max: number): number[];",
			"declarationLines": ["distinctInts(count: number, min: number, max: number): number[];"]
		},
		{
			"name": "float",
			"signature": "float(min: number, max: number, precision?: number): number;",
			"declarationLines": ["float(min: number, max: number, precision?: number): number;"]
		},
		{
			"name": "even",
			"signature": "even(min: number, max: number): number;",
			"declarationLines": ["even(min: number, max: number): number;"]
		},
		{
			"name": "odd",
			"signature": "odd(min: number, max: number): number;",
			"declarationLines": ["odd(min: number, max: number): number;"]
		},
		{
			"name": "prime",
			"signature": "prime(min: number, max: number): number;",
			"declarationLines": ["prime(min: number, max: number): number;"]
		},
		{
			"name": "coprime",
			"signature": "coprime(min: number, max: number): [",
			"declarationLines": [
				"coprime(min: number, max: number): [",
				"    number,",
				"    number",
				"];"
			]
		},
		{
			"name": "divisible",
			"signature": "divisible(min: number, max: number, d: number): number;",
			"declarationLines": ["divisible(min: number, max: number, d: number): number;"]
		},
		{
			"name": "sequence",
			"signature": "sequence(options: SequenceOptions): number[];",
			"declarationLines": ["sequence(options: SequenceOptions): number[];"]
		},
		{
			"name": "string",
			"signature": "string(len: number, charset?: string): string;",
			"declarationLines": ["string(len: number, charset?: string): string;"]
		},
		{
			"name": "palindrome",
			"signature": "palindrome(len: number, charset?: string): string;",
			"declarationLines": ["palindrome(len: number, charset?: string): string;"]
		},
		{
			"name": "word",
			"signature": "word(minLen: number, maxLen: number): string;",
			"declarationLines": ["word(minLen: number, maxLen: number): string;"]
		},
		{
			"name": "words",
			"signature": "words(count: number, minLen: number, maxLen: number): string[];",
			"declarationLines": ["words(count: number, minLen: number, maxLen: number): string[];"]
		},
		{
			"name": "brackets",
			"signature": "brackets(n: number, options?: {",
			"declarationLines": [
				"brackets(n: number, options?: {",
				"    types?: string;",
				"}): string;"
			]
		},
		{
			"name": "array",
			"signature": "array<T>(count: number, itemGenerator: (index: number) => T): T[];",
			"declarationLines": ["array<T>(count: number, itemGenerator: (index: number) => T): T[];"]
		},
		{
			"name": "sorted",
			"signature": "sorted(count: number, min: number, max: number, options?: {",
			"declarationLines": [
				"sorted(count: number, min: number, max: number, options?: {",
				"    order?: 'asc' | 'desc' | 'strictlyAsc' | 'strictlyDesc';",
				"}): number[];"
			]
		},
		{
			"name": "sparse",
			"signature": "sparse(count: number, min: number, max: number, gap: number): number[];",
			"declarationLines": ["sparse(count: number, min: number, max: number, gap: number): number[];"]
		},
		{
			"name": "partition",
			"signature": "partition(count: number, sum: number, options?: {",
			"declarationLines": [
				"partition(count: number, sum: number, options?: {",
				"    minVal?: number;",
				"}): number[];"
			]
		},
		{
			"name": "matrix",
			"signature": "matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][];",
			"declarationLines": ["matrix<T>(rows: number, cols: number, cellGenerator: (r: number, c: number) => T): T[][];"]
		},
		{
			"name": "grid01",
			"signature": "grid01(rows: number, cols: number, density?: number): number[][];",
			"declarationLines": ["grid01(rows: number, cols: number, density?: number): number[][];"]
		},
		{
			"name": "maze",
			"signature": "maze(rows: number, cols: number, options?: {",
			"declarationLines": [
				"maze(rows: number, cols: number, options?: {",
				"    wall?: string;",
				"    road?: string;",
				"}): string[][];"
			]
		},
		{
			"name": "intervals",
			"signature": "intervals(n: number, min: number, max: number, options?: {",
			"declarationLines": [
				"intervals(n: number, min: number, max: number, options?: {",
				"    overlapping?: boolean;",
				"    sorted?: boolean;",
				"    minLen?: number;",
				"    maxLen?: number;",
				"    allowGaps?: boolean;",
				"}): number[][];"
			]
		},
		{
			"name": "permutation",
			"signature": "permutation(n: number, oneBased?: boolean): number[];",
			"declarationLines": ["permutation(n: number, oneBased?: boolean): number[];"]
		},
		{
			"name": "shuffle",
			"signature": "shuffle<T>(array: readonly T[]): T[];",
			"declarationLines": ["shuffle<T>(array: readonly T[]): T[];"]
		},
		{
			"name": "sample",
			"signature": "sample<T>(population: readonly T[]): T;",
			"declarationLines": ["sample<T>(population: readonly T[]): T;", "sample<T>(population: readonly T[], k: number): T[];"]
		},
		{
			"name": "chunk",
			"signature": "chunk<T>(array: readonly T[], size: number): T[][];",
			"declarationLines": ["chunk<T>(array: readonly T[], size: number): T[][];"]
		},
		{
			"name": "tree",
			"signature": "tree(n: number, options?: TreeOptions): number[][];",
			"declarationLines": ["tree(n: number, options?: TreeOptions): number[][];"]
		},
		{
			"name": "graph",
			"signature": "graph(n: number, m: number, options?: GraphOptions): number[][];",
			"declarationLines": ["graph(n: number, m: number, options?: GraphOptions): number[][];"]
		},
		{
			"name": "points",
			"signature": "points(n: number, minVal: number, maxVal: number, options?: {",
			"declarationLines": [
				"points(n: number, minVal: number, maxVal: number, options?: {",
				"    type?: 'random' | 'collinear';",
				"}): number[][];"
			]
		},
		{
			"name": "convexHull",
			"signature": "convexHull(n: number, minVal: number, maxVal: number): number[][];",
			"declarationLines": ["convexHull(n: number, minVal: number, maxVal: number): number[][];"]
		},
		{
			"name": "polygon",
			"signature": "polygon(n: number, minVal: number, maxVal: number): number[][];",
			"declarationLines": ["polygon(n: number, minVal: number, maxVal: number): number[][];"]
		},
		{
			"name": "binaryTree",
			"signature": "binaryTree(n: number, options?: BinaryTreeOptions): {",
			"declarationLines": [
				"binaryTree(n: number, options?: BinaryTreeOptions): {",
				"    edges: number[][];",
				"    root: number;",
				"};"
			]
		},
		{
			"name": "isLeap",
			"signature": "isLeap(year: number): boolean;",
			"declarationLines": ["isLeap(year: number): boolean;"]
		},
		{
			"name": "year",
			"signature": "year(minYear?: number, maxYear?: number): number;",
			"declarationLines": ["year(minYear?: number, maxYear?: number): number;"]
		},
		{
			"name": "date",
			"signature": "date(options?: {",
			"declarationLines": [
				"date(options?: {",
				"    minYear?: number;",
				"    maxYear?: number;",
				"    format?: string;",
				"}): string;"
			]
		},
		{
			"name": "debug",
			"signature": "debug<T>(data: T, options?: DebugOptions): void;",
			"declarationLines": ["debug<T>(data: T, options?: DebugOptions): void;", "debug<T>(label: string, data: T, options?: DebugOptions): void;"]
		}
	],
	"baseMethods": [
		{
			"name": "convert",
			"signature": "convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;",
			"declarationLines": ["convert(input: string | number | bigint, fromRadix: number, toRadix: number): string;"]
		},
		{
			"name": "binToHex",
			"signature": "binToHex(binString: string): string;",
			"declarationLines": ["binToHex(binString: string): string;"]
		},
		{
			"name": "hexToBin",
			"signature": "hexToBin(hexString: string): string;",
			"declarationLines": ["hexToBin(hexString: string): string;"]
		},
		{
			"name": "digits",
			"signature": "digits(length: number, radix: number): string;",
			"declarationLines": ["digits(length: number, radix: number): string;"]
		}
	],
	"charsetProperties": [
		"LOWERCASE",
		"UPPERCASE",
		"DIGITS",
		"ALPHANUMERIC",
		"ALPHA",
		"BASE36"
	]
};

//#endregion
//#region src/ai-contract.ts
const FMT_METHOD_PATCHES = {
	lines: { docLines: ["/** Multiple rows. Each item may be one atom, one atom array, or one fmt.* node. */", "/** Atom arrays become one space-separated line; nested fmt.* nodes are embedded verbatim. */"] },
	grid: { docLines: ["/** Grid-style rows with no separator inside each row. */", "/** Use fmt.table(...) instead when row items should be separated by spaces. */"] },
	raw: { docLines: ["/** Raw text passthrough. */", "/** Text is emitted exactly as provided, including embedded newlines. */"] }
};
const GENERATOR_METHOD_PATCHES = {
	sample: { docLines: ["/** Pick one element from a candidate list. */", "/** Pick k distinct elements without replacement from a candidate list. */"] },
	sparse: { docLines: ["/** Numeric array whose sorted order has adjacent differences >= gap. */", "/** Final output order may be shuffled. Sort it yourself if order matters. */"] },
	partition: { docLines: ["/** Positive integers whose sum is sum. */", "/** Final output order may be shuffled. */"] },
	intervals: {
		docLines: ["/** Interval list. */", "/** When overlapping is false and sorted is not set, interval order may be shuffled. */"],
		declarationLines: ["intervals(n: number, min: number, max: number, options?: { overlapping?: boolean; sorted?: boolean; minLen?: number; maxLen?: number; allowGaps?: boolean; }): Array<[number, number]>;"]
	},
	tree: { declarationLines: ["tree(n: number, options?: TreeOptions): Array<[number, number] | [number, number, number]>;"] },
	graph: { declarationLines: ["graph(n: number, m: number, options?: GraphOptions): Array<[number, number] | [number, number, number]>;"] },
	points: { declarationLines: ["points(n: number, minVal: number, maxVal: number, options?: { type?: 'random' | 'collinear'; }): Array<[number, number]>;"] },
	convexHull: { declarationLines: ["convexHull(n: number, minVal: number, maxVal: number): Array<[number, number]>;"] },
	polygon: { declarationLines: ["polygon(n: number, minVal: number, maxVal: number): Array<[number, number]>;"] },
	binaryTree: {
		docLines: ["/** Binary tree edges and the actual root label of this generated tree. */"],
		declarationLines: [
			"binaryTree(n: number, options?: BinaryTreeOptions): {",
			"  edges: Array<[number, number]>;",
			"  root: number;",
			"};"
		]
	},
	date: { docLines: ["/** Supported format tokens are YYYY, MM, and DD. */"] }
};
const BASE_METHOD_PATCHES = { digits: { docLines: ["/** For length > 1, the first digit is non-zero. */"] } };
const DATASET_DECLARATION_PATCHES = { DatasetValidationReturn: { docLines: ["/** void/true => pass, false => fail with a generic message, string => fail with that reason. */", "/** { ok: false, reason } => fail with a structured reason. */"] } };
const RESOLVED_HEADER_DECLARATIONS = AI_CONTRACT_GENERATED.headerDeclarations.map((block) => resolveBlock(block));
const RESOLVED_DATASET_DECLARATIONS = AI_CONTRACT_GENERATED.datasetDeclarations.map((block) => resolveBlock(block, DATASET_DECLARATION_PATCHES[block.name]));
const RESOLVED_FMT_METHODS = AI_CONTRACT_GENERATED.fmtMethods.map((method) => resolveMethod(method, FMT_METHOD_PATCHES[method.name]));
const RESOLVED_GENERATOR_METHODS = AI_CONTRACT_GENERATED.generatorMethods.map((method) => resolveMethod(method, GENERATOR_METHOD_PATCHES[method.name]));
const RESOLVED_BASE_METHODS = AI_CONTRACT_GENERATED.baseMethods.map((method) => resolveMethod(method, BASE_METHOD_PATCHES[method.name]));
const RESOLVED_FMT_METHOD_MAP = Object.fromEntries(RESOLVED_FMT_METHODS.map((method) => [method.name, method]));
const RESOLVED_GENERATOR_METHOD_MAP = Object.fromEntries(RESOLVED_GENERATOR_METHODS.map((method) => [method.name, method]));
const RESOLVED_BASE_METHOD_MAP = Object.fromEntries(RESOLVED_BASE_METHODS.map((method) => [method.name, method]));
const AI_FMT_METHOD_SIGNATURES = Object.fromEntries(RESOLVED_FMT_METHODS.map((method) => [method.name, method.signature]));
const AI_GENERATOR_METHOD_SIGNATURES = Object.fromEntries(RESOLVED_GENERATOR_METHODS.map((method) => [method.name, method.signature]));
const AI_BASE_METHOD_SIGNATURES = Object.fromEntries(RESOLVED_BASE_METHODS.map((method) => [method.name, method.signature]));
const AI_CHARSET_PROPERTIES = Object.fromEntries(AI_CONTRACT_GENERATED.charsetProperties.map((property) => [property, property]));
const ALL_FMT_METHOD_NAMES = RESOLVED_FMT_METHODS.map((method) => method.name);
const ALL_GENERATOR_METHOD_NAMES = RESOLVED_GENERATOR_METHODS.map((method) => method.name);
const ALL_BASE_METHOD_NAMES = RESOLVED_BASE_METHODS.map((method) => method.name);
const ALL_CHARSET_PROPERTY_NAMES = [...AI_CONTRACT_GENERATED.charsetProperties];
function resolveBlock(block, patch) {
	return {
		name: block.name,
		declarationLines: [...patch?.docLines ?? [], ...patch?.declarationLines ?? block.declarationLines]
	};
}
function resolveMethod(method, patch) {
	const declarationLines = [...patch?.docLines ?? [], ...patch?.declarationLines ?? method.declarationLines];
	return {
		name: method.name,
		declarationLines,
		signature: patch?.signature ?? firstDeclarationLine(declarationLines)
	};
}
function firstDeclarationLine(lines) {
	const line = lines.find((item) => item.trim().length > 0 && !item.trim().startsWith("/**"));
	if (!line) throw new Error("Resolved AI contract declaration lines are empty.");
	return line.trim();
}
function extractSectionBlock(statement, headings) {
	const normalizedHeadings = new Set(headings.map((item) => item.toLowerCase()));
	const lines = statement.split(/\r?\n/);
	const collected = [];
	let active = false;
	for (const line of lines) {
		const trimmed = line.trim();
		const heading = trimmed.replace(/^#+\s*/, "").toLowerCase();
		if (normalizedHeadings.has(heading)) {
			active = true;
			collected.push(line);
			continue;
		}
		if (active && /^#+\s+/.test(trimmed)) break;
		if (active) collected.push(line);
	}
	return collected.join("\n").trim();
}
function normalizeStatementText(text) {
	return text.toLowerCase().replace(/[`*_>#]/g, " ").replace(/\$/g, "").replace(/[()[\]{}，。；：,.:!?]/g, " ").replace(/\s+/g, " ").trim();
}
function buildStructuralText(statement) {
	return normalizeStatementText([
		extractSectionBlock(statement, [
			"输入格式",
			"输入",
			"input format",
			"input"
		]),
		extractSectionBlock(statement, [
			"数据范围",
			"constraints",
			"limits"
		]),
		extractSectionBlock(statement, ["格式", "format"])
	].filter(Boolean).join("\n\n") || statement);
}
function buildWholeText(statement) {
	return normalizeStatementText(statement);
}
function matchesAny(text, patterns) {
	return patterns.some((pattern) => pattern.test(text));
}
function analyzeProblemStatement(statement) {
	const structuralText = buildStructuralText(statement);
	const wholeText = buildWholeText(statement);
	const multiTest = matchesAny(structuralText, [
		/测试用例组数/,
		/多组测试/,
		/接下来\s*t\s*组/,
		/for each test case/,
		/multiple test cases/,
		/the next t/
	]);
	const matrix$1 = matchesAny(structuralText, [
		/(矩阵|matrix).*(接下来.*n.*行|n.*行.*每行.*m)/,
		/(接下来.*n.*行|n.*行.*每行.*m).*(矩阵|matrix)/,
		/n\s+rows?\s+and\s+m\s+columns?/
	]);
	const grid = matchesAny(structuralText, [
		/网格/,
		/\bgrid\b/,
		/迷宫/,
		/\bmaze\b/,
		/字符矩阵/,
		/01矩阵/
	]);
	const tree$1 = matchesAny(structuralText, [
		/输入保证是一棵树/,
		/(树|tree).*(边|edge)/,
		/(接下来.*n\s*-\s*1.*行|next\s+n\s*-\s*1\s+lines?).*(边|edge)/
	]);
	return {
		multiTest,
		matrix: matrix$1,
		tree: tree$1,
		graph: !tree$1 && matchesAny(structuralText, [/(图|graph).*(边|edge)/, /(接下来.*m.*行|next\s+m\s+lines?).*(边|edge)/]),
		interval: matchesAny(structuralText, [
			/区间/,
			/\binterval\b/,
			/\[l/i,
			/\[ r/i
		]),
		string: matchesAny(structuralText, [
			/字符串/,
			/\bstring\b/,
			/字符序列/,
			/character sequence/,
			/单词/
		]),
		grid,
		geometry: matchesAny(wholeText, [
			/坐标/,
			/\bcoordinate\b/,
			/\bcoordinates\b/,
			/\bpolygon\b/,
			/多边形/,
			/几何/,
			/平面/,
			/二维点/
		])
	};
}
function selectAiContract(statement) {
	const profile = analyzeProblemStatement(statement);
	const canonicalPatterns = [
		"Default dataset shape: export default defineDataset<Input>({ solution, seed, format, validate, cases })",
		"Static case: { name, input }",
		"Generated case: { name, repeat?, generate: ({ g, caseIndex, caseNumber, caseName, repeatIndex, seed }) => input }",
		"Canonical explicit format style: fmt.lines(fmt.line(...), fmt.table(...), fmt.grid(...), fmt.raw(...))",
		"Matrix/grid input pattern: { n, m, rows } with fmt.lines(fmt.line(n, m), fmt.table(rows)) or fmt.lines(fmt.line(n, m), fmt.grid(rows))",
		"Graph/tree input pattern: { n, edges } or { n, m, edges } with fmt.lines(fmt.line(...header), fmt.table(edges))",
		"Multi-test input pattern: { tests: [...] } with fmt.lines(fmt.line(t), ...tests.flatMap(...))"
	];
	return {
		profile,
		fmtMethods: [...ALL_FMT_METHOD_NAMES],
		generatorMethods: [...ALL_GENERATOR_METHOD_NAMES],
		baseMethods: [...ALL_BASE_METHOD_NAMES],
		charsetProperties: [...ALL_CHARSET_PROPERTY_NAMES],
		canonicalPatterns
	};
}
function resolveAiContractAllowance(selection) {
	return {
		fmtMethods: [...selection.fmtMethods],
		generatorMethods: [...selection.generatorMethods],
		baseMethods: [...selection.baseMethods],
		charsetProperties: [...selection.charsetProperties],
		generatorPropertyRoots: [...selection.charsetProperties.length > 0 ? ["CHARSET"] : [], ...selection.baseMethods.length > 0 ? ["base"] : []]
	};
}
function indentLines(lines, spaces = 2) {
	const indent = " ".repeat(spaces);
	return lines.map((line) => line.length > 0 ? `${indent}${line}` : line);
}
function renderDeclarationBlock(lines) {
	return indentLines(lines, 4);
}
function renderNamedBlocks(blocks, spaces = 2) {
	const rendered = [];
	for (const [index, block] of blocks.entries()) {
		if (index > 0) rendered.push("");
		rendered.push(...indentLines(block.declarationLines, spaces));
	}
	return rendered;
}
function renderFmtInterface(selection) {
	const lines = ["  export const fmt: {"];
	for (const methodName of selection.fmtMethods) lines.push(...renderDeclarationBlock(RESOLVED_FMT_METHOD_MAP[methodName].declarationLines));
	lines.push("  };");
	return lines;
}
function renderGeneratorInterface(selection) {
	const lines = ["  export interface DatasetGenerator {"];
	if (selection.charsetProperties.length > 0) {
		lines.push("    readonly CHARSET: {");
		for (const property of selection.charsetProperties) lines.push(`      readonly ${property}: string;`);
		lines.push("    };");
	}
	for (const methodName of selection.generatorMethods) lines.push(...renderDeclarationBlock(RESOLVED_GENERATOR_METHOD_MAP[methodName].declarationLines));
	if (selection.baseMethods.length > 0) {
		lines.push("    readonly base: {");
		for (const methodName of selection.baseMethods) lines.push(...indentLines(RESOLVED_BASE_METHOD_MAP[methodName].declarationLines, 6));
		lines.push("    };");
	}
	lines.push("  }");
	return lines;
}
function renderAiGenesisContractDts(selection = selectAiContract("")) {
	return `${[
		"// Genesis AI contract for maker.ts",
		"// Only use declarations present in this file.",
		"// If a helper is missing, write plain TypeScript instead of inventing a Genesis API.",
		"",
		"declare module 'genesis-kit' {",
		...renderNamedBlocks(RESOLVED_HEADER_DECLARATIONS),
		"",
		...renderFmtInterface(selection),
		"",
		...renderGeneratorInterface(selection),
		"",
		...renderNamedBlocks(RESOLVED_DATASET_DECLARATIONS),
		"}",
		"",
		"// Canonical patterns:",
		...selection.canonicalPatterns.map((item) => `// - ${item}`),
		"",
		"// Notes:",
		"// - Import only defineDataset and fmt from genesis-kit",
		"// - Use only the fmt.* and g.* declarations shown above"
	].join("\n")}\n`;
}
function renderAiGenesisContractMarkdown(selection = selectAiContract("")) {
	return renderAiGenesisContractDts(selection);
}
function isAiFormatMethodName(value) {
	return value in RESOLVED_FMT_METHOD_MAP;
}
function isAiGeneratorMethodName(value) {
	return value in RESOLVED_GENERATOR_METHOD_MAP;
}

//#endregion
export { AI_BASE_METHOD_SIGNATURES, AI_CHARSET_PROPERTIES, AI_FMT_METHOD_SIGNATURES, AI_GENERATOR_METHOD_SIGNATURES, analyzeProblemStatement, createFormatDocument, createGenerator, createSeededRng, defineDataset, expandDatasetCases, fmt, generateDataset, generateDatasetFromFile, isAiFormatMethodName, isAiGeneratorMethodName, isDataset, isFormatDocument, isFormatNode, loadDatasetFromFile, normalizeFormat, renderAiGenesisContractDts, renderAiGenesisContractMarkdown, renderFormatDocument, replayDataset, replayDatasetFromFile, resolveAiContractAllowance, selectAiContract, validateDataset, validateDatasetFromFile };
//# sourceMappingURL=index.mjs.map