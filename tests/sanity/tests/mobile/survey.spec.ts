// SPDX-License-Identifier: EPL-2.0
import tracker from '@hcengineering/tracker'
import type { Ref } from '@hcengineering/core'
import type { Viewlet } from '@hcengineering/view'
import { activate, capture, expect, issueEditors, resetOverlays, test } from './fixtures'
import type { MobileSurvey } from './fixtures'
import { TrackerNavigationMenuPage } from '../model/tracker/tracker-navigation-menu-page'
import { IssuesPage } from '../model/tracker/issues-page'
import type { Page } from '@playwright/test'

async function navigatorOpen (page: Page): Promise<void> {
  const show = page.locator('button[id="app-workbench:string:ShowMenu"]')
  if (await show.isVisible()) await activate(page, show)
  await expect(page.locator('.antiPanel-navigator')).toBeVisible()
}

async function navigatorClosed (page: Page): Promise<void> {
  const hide = page.locator('button[id="app-workbench:string:HideMenu"]')
  // On wide desktop the navigator is a sibling, rather than a covering overlay.
  if (await hide.isVisible() && await page.locator('.antiPanel-navigator').evaluate(el => el.classList.contains('fly'))) {
    await activate(page, hide)
  }
}

async function openProject (page: Page, survey: MobileSurvey): Promise<void> {
  await navigatorOpen(page)
  const navigation = new TrackerNavigationMenuPage(page)
  const project = navigation.buttonProjectsParent().filter({ hasText: survey.project.name })
  const issues = navigation.issuesLinkForProject(survey.project.name)
  await expect(project).toHaveCount(1)
  if (!await issues.isVisible()) await activate(page, project)
  await activate(page, issues)
  await expect(page).toHaveURL(url => url.pathname === new URL(`${survey.root}/tracker/${survey.project._id}/issues`).pathname)
  await navigatorClosed(page)
}

async function chooseView (page: Page, id: Ref<Viewlet>): Promise<void> {
  const tab = page.getByTestId(`tab-${id}`)
  await activate(page, tab)
  await activate(page, new IssuesPage(page).modelSelectorAll())
  await expect(tab.locator('input[name="viewletSelector"]')).toBeChecked()
}

test('survey reaches real list board and create', async ({ page, survey, harnessURL }, info) => {
  // This readiness check proves compilation/serving only, never an app-flow success.
  await page.goto(`${harnessURL}/?adapter=${process.env.MOBILE_PWA_ADAPTER === 'legacy' ? 'legacy' : 'candidate'}`)
  await expect(page.getByRole('status')).toHaveText('Harness ready')
  await expect(page.getByRole('region', { name: 'Mobile component harness' })).toHaveCount(1)

  const phone = info.project.name === 'iphone-15' || info.project.name === 'pixel-7'
  const initialViewport = page.viewportSize()
  if (initialViewport === null) throw new Error('Viewport is required')
  const orientations = phone ? ['portrait', 'landscape'] : ['desktop']
  const projectURL = `${survey.root}/tracker/${survey.project._id}/issues`
  const home = `${survey.root}/tracker/all-issues`

  // This adapter reproduces the old survey's plugin lookup after successful setup.
  // A missing browser/import/login is not accepted as behavioral red evidence.
  if (process.env.MOBILE_PWA_ADAPTER === 'legacy') {
    for (const name of ['list', 'board', 'create', 'separate editors']) {
      survey.steps.push({ name: `legacy: ${name}`, outcome: 'not-tested', cleanup: 'failed' })
    }
    await resetOverlays(page, projectURL)
    await activate(page, new IssuesPage(page).modelSelectorAll())
    await expect(new IssuesPage(page).issuesList()).toContainText(survey.issue.title)
    await capture(page, info, 'legacy-viewlet-lookup')
    const legacy = tracker as unknown as { viewlet?: { IssueList?: string, IssueKanban?: string } }
    survey.behaviorStarted = true
    expect({ list: legacy.viewlet?.IssueList, board: legacy.viewlet?.IssueKanban },
      'Legacy survey must resolve concrete Issue viewlets').toEqual(survey.viewlets)
  }

  survey.behaviorStarted = true
  for (const orientation of orientations) {
    if (orientation === 'landscape') {
      await page.setViewportSize({ width: initialViewport.height, height: initialViewport.width })
    }
    await survey.step(`${orientation}: list`, async () => {
      await resetOverlays(page, home)
      await openProject(page, survey)
      await chooseView(page, survey.viewlets.list)
      const list = new IssuesPage(page).issuesList()
      await expect(list).toBeVisible()
      await expect(list).toContainText(survey.issue.title)
      await expect(page.locator('.tracker-card')).toHaveCount(0)
      await capture(page, info, `${orientation}-list`)
    }, async () => {
      await resetOverlays(page, projectURL)
      await activate(page, new IssuesPage(page).modelSelectorAll())
      await expect(new IssuesPage(page).issuesList()).toContainText(survey.issue.title)
    })

    await survey.step(`${orientation}: board`, async () => {
      await resetOverlays(page, home)
      await openProject(page, survey)
      await chooseView(page, survey.viewlets.board)
      const card = page.locator('.tracker-card').filter({ hasText: survey.issue.title })
      await expect(card).toHaveCount(1)
      await expect(card).toBeVisible()
      await expect(new IssuesPage(page).issuesList()).toHaveCount(0)
      await capture(page, info, `${orientation}-board`)
    })

    await survey.step(`${orientation}: create`, async () => {
      await resetOverlays(page, home)
      await openProject(page, survey)
      await chooseView(page, survey.viewlets.list)
      const issues = new IssuesPage(page)
      await activate(page, issues.newIssue())
      const form = page.locator('form[id="tracker:string:NewIssue"]')
      await expect(form).toBeVisible()
      await expect(form).toContainText(survey.project.name)
      await expect(issues.inputPopupCreateNewIssueTitle()).toBeVisible()
      await expect(issues.inputPopupCreateNewIssueDescription()).toHaveCount(1)
      await capture(page, info, `${orientation}-create`)
      // Leave the form empty: no new issue, upload, or draft write is required here.
      await activate(page, form.locator('#card-close'))
      await expect(form).toHaveCount(0)
      await page.reload()
      const persisted = await survey.client.findAll(tracker.class.Issue, { space: survey.project._id })
      expect(persisted.map(issue => issue._id), 'Cancel must not create an Issue').toEqual([survey.issue._id])
    })

    await survey.step(`${orientation}: separate editors`, async () => {
      await resetOverlays(page, home)
      await openProject(page, survey)
      await chooseView(page, survey.viewlets.list)
      await activate(page, new IssuesPage(page).issueByName(survey.issue.title))
      await expect(page.locator('.popupPanel')).toHaveCount(1)
      const editors = issueEditors(page)
      await expect(editors.description).toHaveCount(1)
      await expect(editors.comment).toHaveCount(1)
      expect(await editors.description.evaluate(element => element.closest('.text-input') === null),
        'Description must not resolve to the comment composer').toBe(true)
      expect(await editors.comment.evaluate(element => element.closest('.textInput') === null),
        'Comment must not resolve to the description editor').toBe(true)
      await capture(page, info, `${orientation}-editors`)
    })
  }
  // Cleanup is asserted by the fixture teardown, independently from these UI outcomes.
  expect(survey.steps.map(step => step.outcome),
    'Every view must be reached through the UI; URL recovery never passes').toEqual(
    Array.from({ length: orientations.length * 4 }, () => 'ui')
  )
})
