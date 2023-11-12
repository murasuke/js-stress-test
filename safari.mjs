/**
 * safari
 */
import {webkit} from 'playwright';

// safari(headless: false)で起動
const browser = await webkit.launch({ headless: false });
const context = await browser.newContext();
const page = await context.newPage();