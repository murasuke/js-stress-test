# ブラウザを操作した負荷テストスクリプト(PlayWright)

指定したURLを並列でアクセスするスクリプトです(PlayWrightを利用)

* ブラウザを利用して負荷をかけるため、画面のURLを指定すれば、cssやjavascriptファイルも同時に取得します
* 20ブラウザを同時に開いて、指定回数アクセスを繰り返すことができます


* 指定した数のブラウザを同時に開き、全ブラウザが読み込み完了する時間を測定します
* ブラウザ毎に繰り返す回数も指定できます


### ex. 3ブラウザ同時 × 2回繰り返しアクセス（合計6回）を行った場合の例
```
$ node stress-repeat.mjs 3 <対象URL> 2
open 3 browsers
#2-1 time: 1237ms
#3-1 time: 1593ms
#1-1 time: 1996ms
#2-2 time: 665ms
#1-2 time: 799ms
#3-2 time: 756ms
*** result ***
mean:1174.33 min: 665 max:1996
{
  sequence: [
    { i: 2, times: 1, duration: 1237, endTime: 1699801162166 },
    { i: 3, times: 1, duration: 1593, endTime: 1699801162724 },
    { i: 1, times: 1, duration: 1996, endTime: 1699801162725 },
    { i: 2, times: 2, duration: 665, endTime: 1699801163065 },
    { i: 1, times: 2, duration: 799, endTime: 1699801163599 },
    { i: 3, times: 2, duration: 756, endTime: 1699801163964 }
  ],
  durations: [ [ 1996, 799 ], [ 1237, 665 ], [ 1593, 756 ] ]
}
```


### 引数仕様
    1：同時に開くブラウザ数
        未指定時は:1
    2：対象URL 
    　　 未指定時は環境変数：STRESS_TARGET_URL
    3: 繰り返し回数
        未指定時は環境変数：REPEAT_COUNT (両方未指定の場合:1)
    4：ブラウザ読み込みをずらす時間(ms) 
        未指定時は環境変数：OPEN_DELAY (両方未指定の場合:0)
    5：読み込み完了を判断するための文字列(未指定時はページが開けたら完了)
        未指定時は環境変数：RENDER_WAIT_SELECTOR（省略可）


### ソース

```javascript
/**
 * 負荷テスト用スクリプト 
 * ・指定数のブラウザを同時に開き、全ブラウザが読み込み完了する時間を測定する
 * 引数
 *   1：同時に開くブラウザ数
 *      未指定時は:1
 *   2：対象URL 
 * 　　 未指定時は環境変数：STRESS_TARGET_URL
 *   3: 繰り返し回数
 *      未指定時は環境変数：REPEAT_COUNT (両方未指定の場合:1)
 *   4：ブラウザ読み込みをずらす時間(ms) 
 *      未指定時は環境変数：OPEN_DELAY (両方未指定の場合:0)
 *   5：読み込み完了を判断するための文字列(未指定時はページが開けたら完了)
 *      未指定時は環境変数：RENDER_WAIT_SELECTOR（省略可）
 */
import { setTimeout } from 'timers/promises';
import {chromium} from 'playwright';
import * as dotenv from 'dotenv'
dotenv.config(); // .env初期化

const getArgs = (i, def) => process.argv.length > i ? process.argv[i]: def;

// 引数1: 並列実行数
const pallallelCount = parseInt(getArgs(2, 1), 10);
// 引数2: 対象URL
const targetURL = getArgs(3, process.env.STRESS_TARGET_URL);
// 引数3: 繰り返し回数
const repeatCount = getArgs(4, process.env.REPEAT_COUNT ?? 1);
// 引数4: 実行ディレイ
const execDelay = parseInt(getArgs(5, process.env.OPEN_DELAY ?? 0));
// 引数5: 読み込み完了を判断するための文字列
const waitSelector = getArgs(6, process.env.RENDER_WAIT_SELECTOR ?? '');

// 対象URLがなければ終了
if (!targetURL) {process.exit(0)};

console.log(`open ${pallallelCount} browsers`);

// chrome(headless: false)で起動
const browser = await chromium.launch({ headless: false });

// ブラウザを開く
// ・同一context内で複数ページを開くと、TCPコネクションを共有してしまうため、contextレベルで分離する
const contexts = [];
// 実行結果保持用
const results = {sequence: [], durations: []};
for (let i = 0; i < pallallelCount; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120*1000);
    contexts.push({i: i+1, context, page, delay: i * execDelay});
    results.durations.push([]);
}

// 実行結果を追加
const addLog = (i, times, duration, endTime) => {
    results.sequence.push({i, times, duration, endTime})
    results.durations[i-1].push(duration);
}

// 全ブラウザの処理完了を管理する(Promise)ための配列
let procedures = [];

// ページ表示にかかった時間を、画面毎に表示する
// 並行で実行させるためawaitを使わない
for (let {i, page, context, delay} of contexts) {
    procedures.push(new Promise( (resolve)  => {
        const procedure = (times) => {
            if (times > repeatCount) {
                // 指定回数実行したら終了
                resolve();
                return context.close();
            }

            let startTime = 0; // 開始時刻
            // 指定秒ごとに開く
            setTimeout(delay).then(() => { 
                startTime = Date.now();
                return page.goto(targetURL); 
            }).then(
                // 登録するボタンが表示されるまで待つ(jsによる動的ロード＋描画待ち)
                () => waitSelector ? page.locator(`text=${waitSelector}`).innerHTML(): ''
            ).then(() => {
                // 画面表示完了にかかった時間を表示
                const endTime = Date.now() ;
                const duration = endTime - startTime;
                console.log(`#${i}-${times} time: ${duration}ms`);
                addLog(i, times, duration, endTime);
                return page.goto('about:blank');
            }).then(() => {
                // 再度表示
                return procedure(++times);
            });
        };
        procedure(1);
    }));
}

const dumpResult = (results) => {
    const durations = results.sequence.map(x => x.duration);
    let mean = (durations.reduce((x, y) => x + y) / durations.length).toFixed(2);
    let min = Math.min(...durations);
    let max = Math.max(...durations);

    console.log(`mean:${mean} min: ${min} max:${max}`);
    console.log(results);
}

// 全処理が完了したら後始末
Promise.all(procedures).then(() => {
    console.log('*** result ***');
    dumpResult(results);
    return browser.close();
});

```