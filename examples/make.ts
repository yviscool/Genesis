// examples/make.ts
import { Maker, G } from '../src/index';


await Maker
  .configure({
    solution: 'examples/std.cpp', 
    // 我们把起始编号设为 101，来测试这个配置是否生效
    // startFrom: 101, 
  })
  
  // 生成 5 个小数据
  .cases(5, () => [
    G.int(1, 1000), 
    G.int(1, 1000)
  ])
  
  // 生成一个边界数据
  .case('zero', () => [0, 0])

  // 生成 5 个大数据
  .cases(5, () => [
    G.bigint(10n**17n, 10n**18n - 1n),
    G.bigint(10n**17n, 10n**18n - 1n)
  ])

  .generate();