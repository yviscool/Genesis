// src/generator/graphs.ts
// 图论生成模块 — 静态导出

import * as core from './core';
import * as arrays from './arrays';
import type { TreeOptions, GraphOptions, BinaryTreeOptions } from '../types';

// ============ 静态导出函数 ============

export function tree(n: number, options: TreeOptions = {}): number[][] {
    const { type = 'random', oneBased = true, weighted = false } = options;
    if (n <= 1) return [];

    const edges: number[][] = [];

    if (type === 'path') {
        const nodes = arrays.permutation(n, false);
        for (let i = 0; i < n - 1; i++) edges.push([nodes[i], nodes[i + 1]]);
    } else if (type === 'star') {
        const nodes = arrays.permutation(n, false);
        for (let i = 1; i < n; i++) edges.push([nodes[0], nodes[i]]);
    } else {
        const nodes = arrays.permutation(n, false);
        for (let i = 1; i < n; i++) edges.push([nodes[i], nodes[core.int(0, i - 1)]]);
    }

    let result = core.shuffle(edges);
    if (weighted) {
        const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1_000_000_000];
        result.forEach(e => e.push(core.int(minW, maxW)));
    }
    if (oneBased) {
        result = result.map(e => {
            const ne = [e[0] + 1, e[1] + 1];
            if (e.length > 2) ne.push(e[2]);
            return ne;
        });
    }
    return result;
}

export function graph(n: number, m: number, options: GraphOptions = {}): number[][] {
    const {
        type = 'simple',
        weighted = false,
        connected = false,
        noSelfLoops = true,
        oneBased = true,
        negativeCycle = false
    } = options;

    let { directed = false } = options;
    if (type === 'dag' && options.directed === undefined) directed = true;
    if (negativeCycle && type === 'dag') {
        throw new Error("Option 'negativeCycle' cannot be used with DAG graphs.");
    }

    if (n <= 0) return [];

    // 轮图
    if (type === 'wheel') {
        if (n < 4) throw new Error('Wheel graph requires at least 4 vertices.');
        const edges: number[][] = [];
        for (let i = 1; i < n; i++) edges.push([0, i]);
        for (let i = 1; i < n; i++) edges.push([i, i === n - 1 ? 1 : i + 1]);
        let result = edges;
        if (weighted) {
            const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
            result.forEach(e => e.push(core.int(minW, maxW)));
        }
        if (oneBased) result = result.map(e => e.map((v, i) => i < 2 ? v + 1 : v));
        return core.shuffle(result);
    }

    // 完全图
    if (type === 'complete') {
        const edges: number[][] = [];
        for (let i = 0; i < n; i++) {
            for (let j = i + 1; j < n; j++) {
                edges.push([i, j]);
                if (directed) edges.push([j, i]);
            }
        }
        let result = edges;
        if (weighted) {
            const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
            result.forEach(e => e.push(core.int(minW, maxW)));
        }
        if (oneBased) result = result.map(e => e.map((v, i) => i < 2 ? v + 1 : v));
        return core.shuffle(result);
    }

    // 树
    if (type === 'tree') {
        if (m !== n - 1) throw new Error(`A tree with ${n} vertices must have ${n - 1} edges.`);
        return tree(n, { oneBased, weighted });
    }

    // 边数检查
    if (connected && m < n - 1) {
        throw new Error(`A connected graph needs at least ${n - 1} edges.`);
    }

    let maxEdges: number;
    if (type === 'dag') {
        maxEdges = n * (n - 1) / 2;
    } else if (type === 'bipartite') {
        const h = Math.floor(n / 2);
        maxEdges = h * (n - h) * (directed ? 2 : 1);
    } else {
        maxEdges = directed
            ? (noSelfLoops ? n * (n - 1) : n * n)
            : (noSelfLoops ? n * (n - 1) / 2 : n * (n + 1) / 2);
    }

    if (m > maxEdges) {
        throw new Error(`Graph with ${n} vertices of type '${type}' (directed: ${directed}) can have at most ${maxEdges} edges. Requested: ${m}.`);
    }

    const edgeSet = new Set<string>();
    const addEdge = (u: number, v: number) => {
        if (noSelfLoops && u === v) return false;
        const key = directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;
        if (edgeSet.has(key)) return false;
        edgeSet.add(key);
        return true;
    };

    // DAG
    if (type === 'dag') {
        const nodes = arrays.permutation(n, false);
        if (connected) {
            for (let i = 1; i < n; i++) addEdge(nodes[core.int(0, i - 1)], nodes[i]);
        }
        while (edgeSet.size < m) {
            const i1 = core.int(0, n - 1);
            const i2 = core.int(0, n - 1);
            if (i1 !== i2) addEdge(nodes[Math.min(i1, i2)], nodes[Math.max(i1, i2)]);
        }
    }
    // 二分图
    else if (type === 'bipartite') {
        const nodes = arrays.permutation(n, false);
        const C = directed ? 2 : 1;
        const disc = n * n - 4 * m / C;
        const sqrtD = Math.sqrt(Math.max(0, disc));
        const validMin = Math.max(1, Math.ceil((n - sqrtD) / 2));
        const validMax = Math.min(n - 1, Math.floor((n + sqrtD) / 2));
        const ps = core.int(validMin, validMax);
        const setA = nodes.slice(0, ps);
        const setB = nodes.slice(ps);

        if (connected) {
            addEdge(setA[0], setB[0]);
            for (const u of [...setA.slice(1), ...setB.slice(1)]) {
                addEdge(u, setA.includes(u) ? core.sample(setB) : core.sample(setA));
            }
        }
        while (edgeSet.size < m) {
            addEdge(core.sample(setA), core.sample(setB));
        }
    }
    // 普通图
    else {
        if (connected) {
            tree(n, { type: 'random', oneBased: false }).forEach(([u, v]) => addEdge(u, v));
        }
        while (edgeSet.size < m) {
            addEdge(core.int(0, n - 1), core.int(0, n - 1));
        }
    }

    let result = Array.from(edgeSet).map(k => k.split(',').map(Number));

    if (weighted || negativeCycle) {
        const [minW, maxW] = Array.isArray(weighted) ? weighted : [1, 1e9];
        const maxAbsWeight = Math.max(Math.abs(minW), Math.abs(maxW), 1);

        result.forEach(e => e.push(core.int(minW, maxW)));

        if (negativeCycle) {
            if (result.length === 0) {
                throw new Error("Option 'negativeCycle' requires at least one edge.");
            }

            const edgeKey = (u: number, v: number): string =>
                directed ? `${u},${v}` : `${Math.min(u, v)},${Math.max(u, v)}`;

            const edgeIndex = new Map<string, number>();
            result.forEach((e, idx) => edgeIndex.set(edgeKey(e[0], e[1]), idx));

            const requiredCycle: [number, number][] = [];
            if (directed) {
                if (n === 1) {
                    if (noSelfLoops) {
                        throw new Error("Option 'negativeCycle' with directed graphs requires n >= 2 when self-loops are disabled.");
                    }
                    requiredCycle.push([0, 0]);
                } else if (n === 2) {
                    requiredCycle.push([0, 1], [1, 0]);
                } else {
                    requiredCycle.push([0, 1], [1, 2], [2, 0]);
                }
            } else {
                // In an undirected graph, a single negative edge can be traversed back and forth.
                requiredCycle.push([result[0][0], result[0][1]]);
            }

            if (result.length < requiredCycle.length) {
                throw new Error(`Option 'negativeCycle' requires at least ${requiredCycle.length} edges, but got ${result.length}.`);
            }

            const requiredKeys = new Set(requiredCycle.map(([u, v]) => edgeKey(u, v)));
            const upsertEdge = (u: number, v: number): number => {
                const key = edgeKey(u, v);
                const existingIndex = edgeIndex.get(key);
                if (existingIndex !== undefined) return existingIndex;

                const replaceIndex = result.findIndex(e => !requiredKeys.has(edgeKey(e[0], e[1])));
                const targetIndex = replaceIndex === -1 ? 0 : replaceIndex;
                const oldKey = edgeKey(result[targetIndex][0], result[targetIndex][1]);
                edgeIndex.delete(oldKey);
                result[targetIndex][0] = u;
                result[targetIndex][1] = v;
                edgeIndex.set(key, targetIndex);
                return targetIndex;
            };

            const cycleEdgeIndices = requiredCycle.map(([u, v]) => upsertEdge(u, v));
            for (const idx of cycleEdgeIndices) {
                result[idx][2] = -core.int(1, maxAbsWeight);
            }
        }
    }

    if (oneBased) {
        result = result.map(e => e.map((v, i) => i < 2 ? v + 1 : v));
    }
    return core.shuffle(result);
}

export function binaryTree(n: number, options: BinaryTreeOptions = {}): { edges: number[][]; root: number } {
    const { type = 'random', oneBased = true } = options;
    if (n <= 0) return { edges: [], root: oneBased ? 1 : 0 };

    const offset = oneBased ? 1 : 0;
    const edges: number[][] = [];

    if (type === 'complete') {
        // 完全二叉树：节点 i 的左子节点是 2i+1，右子节点是 2i+2
        for (let i = 0; i < n; i++) {
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n) edges.push([i + offset, left + offset]);
            if (right < n) edges.push([i + offset, right + offset]);
        }
    } else if (type === 'skewed') {
        // 倾斜二叉树：每个节点只有一个子节点（随机左或右）
        const nodes = arrays.permutation(n, false);
        for (let i = 0; i < n - 1; i++) {
            edges.push([nodes[i] + offset, nodes[i + 1] + offset]);
        }
    } else {
        // 随机二叉树：每个节点最多两个子节点
        const nodes = arrays.permutation(n, false);
        const children: number[] = new Array(n).fill(0); // 记录每个节点的子节点数

        for (let i = 1; i < n; i++) {
            // 找一个还能添加子节点的父节点 (子节点数 < 2)
            let parent: number;
            do {
                parent = nodes[core.int(0, i - 1)];
            } while (children[parent] >= 2);

            children[parent]++;
            edges.push([parent + offset, nodes[i] + offset]);
        }
    }

    return { edges: core.shuffle(edges), root: offset };
}
