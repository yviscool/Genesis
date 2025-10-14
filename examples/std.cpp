#include <bits/stdc++.h>  // 万能头文件，包含了几乎所有常用库
using namespace std;

const int N = 1005;    // 地图最大尺寸是1000，用1050保险起见
char      mat[N][N];   // 地图，每个格子是 '.' 或 '#'
int       a[N][N];     // 辅助数组，用于记录若移除某个杂物，它能贡献的开垦数
const int d[4][2] = {  // 上下左右4个方向
    {-1, 0},
    {1, 0},
    {0, -1},
    {0, 1}};

int main() {
    int n, m, ans = 0;  // n行m列，ans为当前不用移除杂物能开垦的地块数量
    scanf("%d%d", &n, &m);
    assert(1 <= n && n <= 1000);  // 保证数据合法
    assert(1 <= m && m <= 1000);

    // 读取地图，注意mat[i] + 1 是为了1-based下标
    for (int i = 1; i <= n; i++)
        scanf("%s", mat[i] + 1);

    // 遍历每个格子
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++) {
            int num = 0;   // 统计有多少个杂物
            int p   = -1;  // 记录这个方向的编号

            // 统计当前格子四周有多少个杂物，并记录第一个杂物方向
            for (int k = 0; k < 4; k++) {
                int ni = i + d[k][0], nj = j + d[k][1];
                if (mat[ni][nj] == '#')
                    num++, p = k;
            }

            if (mat[i][j] == '.' && num == 0) {
                // 当前格子是荒地，且四周都没有杂物，直接可以开垦
                ans++;
            } else if (mat[i][j] == '.' && num == 1) {
                // 只有一个邻居是杂物，可以通过移除那个杂物来使当前格子变得可开垦
                int ni = i + d[p][0], nj = j + d[p][1];
                a[ni][nj]++;
            } else if (mat[i][j] == '#' && num == 0) {
                // 当前是杂物格，但如果四周都没杂物，移除它也能变为可开垦
                a[i][j]++;
            }
        }

    // 在所有可以移除的杂物中，找到最多能多开垦的数量
    int mx = 0;
    for (int i = 1; i <= n; i++)
        for (int j = 1; j <= m; j++)
            mx = max(mx, a[i][j]);

    // 总开垦数 = 原本可开垦数量 + 清除一个杂物能带来的最大增益
    cout << ans + mx << endl;
    return 0;
}