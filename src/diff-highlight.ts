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

                if (expLine) {
                    lines.push(`     ${pc.green('- ' + truncate(expLine, 50))}`);
                } else {
                    lines.push(`     ${pc.green('- ')}${pc.dim('(空)')}`);
                }

                if (actLine) {
                    lines.push(`     ${pc.red('+ ' + truncate(actLine, 50))}`);
                } else {
                    lines.push(`     ${pc.red('+ ')}${pc.dim('(空)')}`);
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
