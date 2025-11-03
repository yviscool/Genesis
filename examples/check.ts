// 导入我们新创建的 Checker 和 G
// (假设在根目录运行 `bun run examples/check.ts`)
import { Checker, G } from '../src';
// import { Checker, G } from 'genesis-kit'; // (如果是作为依赖安装)


// 1. 配置
Checker.configure({
    std: 'std.cpp',          // 标程 (使用 long long)
    target: 'my.cpp',  // 待测解法 (使用 int)
    // compareMode: 'normalized' // 默认值, 自动忽略行尾空格和空行
})
    // 2. 定义数据生成器
    .gen(() => {

        // 90% 的概率生成 "安全" 数据 (int 范围内)
        if (Math.random() < 0.9) {
            const a = G.int(1, 1_000_000_000); // 10^9, int 可以处理
            const b = G.int(1, 1_000_000_000);
            return [[a, b]]; // 格式化为 "a b"
        }

        // 10% 的概率生成 "陷阱" 数据 (HACK)
        // 这两个数字相加会超出 32 位 int (约 2.1 * 10^9) 的范围
        const a = G.int(1_500_000_000, 2_000_000_000);
        const b = G.int(1_500_000_000, 2_000_000_000);

        // 这个 case 会导致 my_buggy.cpp 溢出,
        // 从而输出一个错误的负数, 而 std.cpp 会输出正确的 30-40 亿
        return [
            [a, b]
        ];
    })

    // 3. 设置超时
    .timeout(1000) // 1 秒超时

    // 4. 运行
    .run(500); // 运行 500 次