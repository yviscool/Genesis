#include <iostream>
using namespace std;

int main() {
    int       n;
    long long k;
    cin >> n >> k;

    long long a[1005];
    for (int i = 0; i < n; i++) cin >> a[i];

    for (int i = 0; i < n; i++) {
        int cnt = 0;
        while (a[i] <= k) {
            a[i] = a[i] * 2;
            cnt++;
        }
        if (i > 0) cout << " ";
        cout << cnt;
    }
    cout << endl;
    return 0;
}
