// src/diff-highlight.ts
// 彩色 Diff 高亮工具

import pc from 'picocolors';

/**
 * 生成彩色 Diff 输出
 * @param expected 期望输出（标程）
 * @param actual 实际输出（待测程序）
 * @returns 格式化的 Diff 字符串
 */
export function highlightDiff(expected: string, actual: string): string {
    const expectedLines = expected.replace(/\r\n/g, '\n').split('\n');
    const actualLines = actual.replace(/\r\n/g, '\n').split('\n');

    const maxLines = Math.max(expectedLines.length, actualLines.length);
    const lines: string[] = [];

    // 计算行号宽度
    const lineNumWidth = String(maxLines).length;

    // 表头
    lines.push(pc.dim('─'.repeat(60)));
    lines.push(`${pc.cyan('行号'.padEnd(lineNumWidth + 2))} ${pc.green('期望输出')} │ ${pc.red('实际输出')}`);
    lines.push(pc.dim('─'.repeat(60)));

    let diffCount = 0;
    const maxDiffShow = 10; // 最多显示 10 处差异

    for (let i = 0; i < maxLines; i++) {
        const lineNum = String(i + 1).padStart(lineNumWidth);
        const expLine = expectedLines[i] ?? '';
        const actLine = actualLines[i] ?? '';

        if (expLine === actLine) {
            // 相同行：灰色显示
            lines.push(pc.dim(`${lineNum} │ ${truncate(expLine, 50)}`));
        } else {
            diffCount++;

            if (diffCount <= maxDiffShow) {
                // 不同行：高亮显示
                lines.push(pc.bgRed(pc.white(` ${lineNum} `)) + ' ' + pc.red('✗ 差异'));

                if (expLine && actLine) {
                    // C1: 字符级别 diff
                    const { expHighlight, actHighlight, diffPos } = highlightCharDiff(expLine, actLine);
                    lines.push(`     ${pc.green('- ' + expHighlight)}`);
                    lines.push(`     ${pc.red('+ ' + actHighlight)}`);
                    if (diffPos >= 0) {
                        // 显示差异位置指示器
                        const pointer = ' '.repeat(diffPos + 7) + pc.yellow('^');
                        lines.push(pointer);
                    }
                } else if (expLine) {
                    lines.push(`     ${pc.green('- ' + truncate(expLine, 50))}`);
                    lines.push(`     ${pc.green('- ')}${pc.dim('(空)')}`);
                } else {
                    lines.push(`     ${pc.green('- ')}${pc.dim('(空)')}`);
                    lines.push(`     ${pc.red('+ ' + truncate(actLine, 50))}`);
                }
            } else if (diffCount === maxDiffShow + 1) {
                lines.push(pc.dim(`     ... 省略 ${maxLines - i} 行更多差异 ...`));
                break;
            }
        }
    }

    lines.push(pc.dim('─'.repeat(60)));

    // 统计信息
    const stats: string[] = [];
    if (diffCount === 0) {
        stats.push(pc.green('✓ 完全一致'));
    } else {
        stats.push(pc.red(`✗ 发现 ${diffCount} 处差异`));
    }

    if (expectedLines.length !== actualLines.length) {
        stats.push(pc.yellow(`行数不同: 期望 ${expectedLines.length} 行, 实际 ${actualLines.length} 行`));
    }

    lines.push(stats.join(' │ '));

    return lines.join('\n');
}

/**
 * 生成简洁的 Diff 摘要（用于控制台输出）
 */
export function diffSummary(expected: string, actual: string): string {
    const expectedLines = expected.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());
    const actualLines = actual.replace(/\r\n/g, '\n').split('\n').filter(l => l.trim());

    if (expectedLines.length !== actualLines.length) {
        return pc.yellow(`行数不同: 期望 ${expectedLines.length} 行, 实际 ${actualLines.length} 行`);
    }

    for (let i = 0; i < expectedLines.length; i++) {
        if (expectedLines[i] !== actualLines[i]) {
            return pc.red(`第 ${i + 1} 行不同: 期望 "${truncate(expectedLines[i], 20)}", 实际 "${truncate(actualLines[i], 20)}"`);
        }
    }

    return pc.green('✓ 完全一致');
}

/**
 * 截断过长的字符串
 */
function truncate(str: string, maxLen: number): string {
    if (str.length <= maxLen) return str;
    return str.slice(0, maxLen - 3) + '...';
}

/**
 * C1: 字符级别 Diff 高亮
 * 找出两个字符串第一个不同的位置，并高亮显示
 */
function highlightCharDiff(expected: string, actual: string): { expHighlight: string; actHighlight: string; diffPos: number } {
    const maxLen = 50;
    let diffPos = -1;

    // 找到第一个不同的字符位置
    for (let i = 0; i < Math.max(expected.length, actual.length); i++) {
        if (expected[i] !== actual[i]) {
            diffPos = i;
            break;
        }
    }

    if (diffPos === -1) {
        return { expHighlight: truncate(expected, maxLen), actHighlight: truncate(actual, maxLen), diffPos: -1 };
    }

    // 构建高亮字符串
    const commonPrefix = expected.slice(0, diffPos);
    const expDiff = expected[diffPos] || '';
    const expRest = expected.slice(diffPos + 1);
    const actDiff = actual[diffPos] || '';
    const actRest = actual.slice(diffPos + 1);

    // 高亮差异字符
    const expHighlight = truncate(commonPrefix, 20) +
        (expDiff ? pc.bgGreen(pc.black(expDiff)) : pc.dim('∅')) +
        truncate(expRest, 25);

    const actHighlight = truncate(commonPrefix, 20) +
        (actDiff ? pc.bgRed(pc.white(actDiff)) : pc.dim('∅')) +
        truncate(actRest, 25);

    return { expHighlight, actHighlight, diffPos: Math.min(diffPos, 20) };
}
