// src/error-formatter.ts
// 错误格式化与诊断工具

import pc from 'picocolors';
import fs from 'node:fs';

/**
 * 常见信号的中文解释
 */
const SIGNAL_EXPLANATIONS: Record<string, { name: string; desc: string; hint: string }> = {
    SIGSEGV: {
        name: '段错误 (Segmentation Fault)',
        desc: '程序尝试访问了不属于它的内存区域',
        hint: '检查数组越界、空指针访问、递归过深导致栈溢出'
    },
    SIGFPE: {
        name: '浮点异常 (Floating Point Exception)',
        desc: '发生了非法的算术运算',
        hint: '检查是否存在除以零、模零、或整数溢出'
    },
    SIGABRT: {
        name: '程序异常终止 (Abort)',
        desc: '程序主动调用 abort() 终止',
        hint: '检查 assert 失败、内存分配失败、或 STL 容器操作异常'
    },
    SIGKILL: {
        name: '被系统强制终止 (Killed)',
        desc: '程序被操作系统强制杀死',
        hint: '通常是内存超限 (MLE) 或运行时间过长'
    },
    SIGBUS: {
        name: '总线错误 (Bus Error)',
        desc: '内存对齐错误或访问了不存在的物理地址',
        hint: '检查指针操作是否正确'
    },
    SIGILL: {
        name: '非法指令 (Illegal Instruction)',
        desc: '程序执行了无效的 CPU 指令',
        hint: '可能是内存损坏或编译器问题'
    },
};

/**
 * 从 stderr 或错误信息中检测运行时错误类型并格式化
 */
export function formatRuntimeError(stderr: string, exitCode?: number): string {
    const lines: string[] = [];

    // 尝试检测信号
    for (const [signal, info] of Object.entries(SIGNAL_EXPLANATIONS)) {
        if (stderr.includes(signal) || stderr.toLowerCase().includes(signal.toLowerCase())) {
            lines.push(pc.red(`💥 ${info.name}`));
            lines.push(pc.dim(`   ${info.desc}`));
            lines.push(pc.yellow(`   💡 ${info.hint}`));
            lines.push('');
        }
    }

    // 检测常见的 C++ 运行时错误模式
    if (stderr.includes('out_of_range') || stderr.includes('vector::_M_range_check')) {
        lines.push(pc.red('💥 数组/向量越界访问'));
        lines.push(pc.dim('   程序尝试访问了超出容器边界的元素'));
        lines.push(pc.yellow('   💡 检查 vector.at() 或 [] 操作的下标是否合法'));
        lines.push('');
    }

    if (stderr.includes('bad_alloc')) {
        lines.push(pc.red('💥 内存分配失败'));
        lines.push(pc.dim('   程序尝试分配过多内存'));
        lines.push(pc.yellow('   💡 检查数组大小是否合理，或是否存在无限循环分配'));
        lines.push('');
    }

    if (stderr.includes('stack smashing') || stderr.includes('buffer overflow')) {
        lines.push(pc.red('💥 栈缓冲区溢出'));
        lines.push(pc.dim('   局部数组写入超出了分配的空间'));
        lines.push(pc.yellow('   💡 检查局部数组的大小和访问边界'));
        lines.push('');
    }

    // 如果没有识别出任何特定错误，显示原始 stderr
    if (lines.length === 0 && stderr.trim()) {
        lines.push(pc.red('错误输出:'));
        lines.push(pc.dim(stderr.trim()));
    }

    return lines.join('\n');
}

/**
 * 格式化编译错误，高亮显示错误位置
 */
export function formatCompilerError(stderr: string, sourceFile?: string): string {
    const lines: string[] = [];

    // 匹配常见编译器错误格式: file:line:col: error: message
    const errorPattern = /^(.+?):(\d+):(\d+):\s*(error|warning):\s*(.+)$/gm;
    let match;
    const errors: Array<{ file: string; line: number; col: number; type: string; message: string }> = [];

    while ((match = errorPattern.exec(stderr)) !== null) {
        errors.push({
            file: match[1],
            line: parseInt(match[2], 10),
            col: parseInt(match[3], 10),
            type: match[4],
            message: match[5]
        });
    }

    if (errors.length === 0) {
        // 没有匹配到标准格式，返回原始错误
        return stderr;
    }

    for (const error of errors) {
        const icon = error.type === 'error' ? '❌' : '⚠️';
        const color = error.type === 'error' ? pc.red : pc.yellow;

        lines.push(color(`${icon} ${error.file}:${error.line}:${error.col}`));
        lines.push(`   ${error.message}`);

        // 尝试读取源码并显示错误行
        const targetFile = sourceFile || error.file;
        if (fs.existsSync(targetFile)) {
            try {
                const content = fs.readFileSync(targetFile, 'utf-8');
                const sourceLines = content.split('\n');
                const errorLine = sourceLines[error.line - 1];

                if (errorLine) {
                    lines.push('');
                    lines.push(pc.dim(`   ${error.line} │ `) + errorLine);
                    // 添加指示箭头
                    const pointer = ' '.repeat(error.col - 1) + pc.red('^');
                    lines.push(pc.dim(`     │ `) + pointer);
                }
            } catch {
                // 忽略读取错误
            }
        }
        lines.push('');
    }

    return lines.join('\n');
}

/**
 * 提取退出码对应的信号名称
 */
export function getSignalFromExitCode(exitCode: number): string | null {
    // 在 Unix 系统中，信号导致的退出码 = 128 + 信号值
    if (exitCode > 128) {
        const signalNum = exitCode - 128;
        const signalMap: Record<number, string> = {
            4: 'SIGILL',
            6: 'SIGABRT',
            8: 'SIGFPE',
            9: 'SIGKILL',
            11: 'SIGSEGV',
            7: 'SIGBUS',
        };
        return signalMap[signalNum] || null;
    }
    return null;
}
