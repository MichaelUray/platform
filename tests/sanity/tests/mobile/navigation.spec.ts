// SPDX-License-Identifier: EPL-2.0
import { test, expect } from '@playwright/test'
import { activate, openNavigator, resetOverlays } from './fixtures'
import { NAVIGATOR_GAP_REASON } from './contracts'

// Synthetic pages exercise harness behavior without a deployment, login or fixture writes.
test('navigator waits for the authenticated shell before deciding to open', async ({ page }) => {
  await page.route('http://mobile-harness.invalid/**', async (route) => {
    await route.fulfill({
      contentType: 'text/html',
      body: `<script>
        setTimeout(() => {
          document.body.innerHTML = '<button id="app-workbench:string:ShowMenu">Menu</button>' +
            '<main data-id="contentPanel" style="height:40px"></main><nav class="antiPanel-navigator" hidden></nav>';
          document.querySelector('button').onclick = () => {
            document.querySelector('nav').hidden = false;
            document.querySelector('button').id = 'app-workbench:string:HideMenu';
          };
        }, 250);
      </script>`
    })
  })
  await resetOverlays(page, 'http://mobile-harness.invalid/')
  await openNavigator(page)
  await expect(page.locator('button[id="app-workbench:string:HideMenu"]')).toBeVisible()
})

test('only actual phone navigator interception establishes a known gap', async ({ page }) => {
  await page.setContent(`<div class="workbench-container">
    <button id="target" style="position:fixed;left:20px;top:20px;width:80px;height:44px">View</button>
    <nav class="antiPanel-navigator fly" style="position:fixed;inset:0;background:white;z-index:10"></nav>
  </div>`)
  page.setDefaultTimeout(300)
  const touch = await page.evaluate(() => navigator.maxTouchPoints > 0)
  const failure = await activate(page, page.locator('#target')).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).name).toBe(touch ? 'NavigatorGapError' : 'TimeoutError')
  if (touch) expect((failure as Error).message).toBe(NAVIGATOR_GAP_REASON)
})

test('phone timeouts without navigator interception remain harness errors', async ({ page }) => {
  await page.setContent(`<button id="target" disabled>View</button>
    <nav class="antiPanel-navigator fly" style="position:fixed;inset:0;background:white;z-index:10"></nav>`)
  page.setDefaultTimeout(300)
  const failure = await activate(page, page.locator('#target')).catch((error: unknown) => error)
  expect(failure).toBeInstanceOf(Error)
  expect((failure as Error).name).toBe('TimeoutError')
})
