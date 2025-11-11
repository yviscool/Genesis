import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { consola } from 'consola';
import { t } from '../i18n';

const templates = {
  'std.cpp': `#include <iostream>

int main() {
    long long a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`,
  'my.cpp': `#include <iostream>

// A buggy solution that uses int, which may cause overflow.
int main() {
    int a, b;
    std::cin >> a >> b;
    std::cout << a + b << std::endl;
    return 0;
}
`,
  'make.ts': `import { Maker, G } from 'genesis-kit';

Maker
  .case('Sample', () => {
    return [[1, 2]];
  })
  .cases(5, () => {
    const a = G.int(1, 1000);
    const b = G.int(1, 1000);
    return [[a, b]];
  })
  .case('Large Numbers', () => {
    const a = G.int(1e9, 2e9);
    const b = G.int(1e9, 2e9);
    return [[a, b]];
  })
  .generate();
`,
  'check.ts': `import { Checker, G } from 'genesis-kit';

Checker
  .configure({
    std: 'std.cpp',
    target: 'my.cpp',
  })
  .gen(() => {
    // 95% chance to generate numbers that fit in int
    if (Math.random() < 0.95) {
      return [[G.int(1, 1e9), G.int(1, 1e9)]];
    }
    // 5% chance to generate a HACK case that causes overflow
    return [[G.int(1.5e9, 2e9), G.int(1.5e9, 2e9)]];
  })
  .run(10000); // Run up to 10,000 times or until a bug is found
`,
};

export async function handleInit(directory?: string, force: boolean = false) {
  const targetDir = directory || '.';
  consola.start(t('cli.init.initializing', path.resolve(targetDir)));

  try {
    // Create directory if it doesn't exist
    if (!existsSync(targetDir)) {
      await fs.mkdir(targetDir, { recursive: true });
    }

    const files = await fs.readdir(targetDir);
    if (files.length > 0 && !force) {
      consola.warn(t('cli.init.notEmpty', targetDir));
      return;
    }

    for (const [fileName, content] of Object.entries(templates)) {
      const filePath = path.join(targetDir, fileName);
      await fs.writeFile(filePath, content.trim());
      consola.success(t('cli.init.created', path.relative(process.cwd(), filePath)));
    }

    consola.info(t('cli.init.success'));
    consola.log(
      t(
        'cli.init.nextSteps',
        targetDir,
      ),
    );
  } catch (error: any) {
    consola.error(t('cli.init.failed', error.message));
    process.exit(1);
  }
}
