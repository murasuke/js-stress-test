/**
 * 負荷テスト用スクリプト 
 * ・指定した数のブラウザで、対象ページを指定回数開き、ページ読み込みにかかった時間を出力する
 * ・引数の代わりに環境変数(.env)で指定も可能
 * 引数
 *   1：同時に開くブラウザ数
 *      未指定時は:PARALLEL_COUNT (両方未指定の場合:1)
 *   2：対象URL 
 * 　　 未指定時は環境変数：STRESS_TARGET_URL (両方未指定時はPG終了)
 *   3: 1ブラウザあたりの繰り返し回数
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
const formatHMS = (timestamp) => {
    return (new Date(timestamp)).toLocaleString('ja-JP',{
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        fractionalSecondDigits: 3,
    });
}

// 引数1: 並列実行数
const parallelCount = parseInt(getArgs(2, process.env.PARALLEL_COUNT ?? 1), 10);
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

console.log(`param1 URL     : ${targetURL}`);
console.log(`param2 open    : ${parallelCount} browsers`);
console.log(`param3 repeat  : ${repeatCount} times`);
console.log(`param4 delay   : ${execDelay} ms (For opening the next browser)`);
console.log(`param5 selector: ${waitSelector} (For checking page loading completion)`);

// chrome(headless: false)で起動
const browser = await chromium.launch({ headless: false });

// ブラウザを開く
// ・同一context内で複数ページを開くと、TCPコネクションを共有してしまうため、contextレベルで分離する
const contexts = [];
// 実行結果保持用
const results = {sequence: [], durations: []};
for (let i = 0; i < parallelCount; i++) {
    const context = await browser.newContext();
    const page = await context.newPage();
    page.setDefaultTimeout(120*1000);
    contexts.push({i: i+1, context, page, delay: i * execDelay});
    results.durations.push([]);
}

// 実行結果を追加
const addLog = (i, times, duration, endTime) => {
    results.sequence.push({browser:i, times, duration, endTime:formatHMS(endTime)})
    results.durations[i-1].push(duration);
}

// 全ブラウザの処理完了を管理する(Promise)ための配列
let procedures = [];

console.log(`====== start : ${formatHMS(Date.now())} ======`);
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
                // (waitSelectorが指定された場合は)表示されるまで待つ(jsによる動的ロード＋描画待ち)
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

    console.log(`mean:${mean}(ms) min: ${min}(ms) max:${max}(ms)`);
    console.log(results);
}

// 全処理が完了したら後始末
Promise.all(procedures).then(() => {
    console.log(`====== end:${formatHMS(Date.now())} ======`);
    console.log('\n******** result ********');
    dumpResult(results);
    return browser.close();
});
