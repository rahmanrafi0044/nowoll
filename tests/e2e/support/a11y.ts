// ============================================================================
// Accessibility scan (step 52, docs/accessibility.md) — axe, the standard
// automatic checker (Deque), run on the page as the browser shows it now.
//
// It checks the WCAG 2.1 A and AA rules a machine can decide: text contrast,
// every image/button/field having a name, headings and landmarks, ARIA used
// correctly, the page language, zoom not blocked… About half of WCAG can be
// checked this way; the rest (keyboard use, focus, sensible names) has its own
// browser tests in specs/accessibility.spec.ts.
// ============================================================================
import { AxeBuilder } from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { expect } from './test.js'

// WCAG 2.1 A + AA, plus axe's "best practice" rules (e.g. headings in order,
// one main landmark) — what Lighthouse's accessibility score also checks.
const RULES = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'best-practice']

type Violations = Awaited<ReturnType<AxeBuilder['analyze']>>['violations']

/** One line per problem: rule, how bad, what's wrong, and where (CSS path). */
function describe(violations: Violations) {
  return violations.flatMap((v) =>
    v.nodes.map((n) => `${v.id} [${v.impact}] ${v.help} → ${n.target.join(' ')}`),
  )
}

/**
 * Fails with a readable list if the page (or one part of it) breaks a WCAG 2.1
 * AA rule. `label` names the page/state in the failure message.
 */
export async function expectAccessible(page: Page, label: string, include?: string) {
  let scan = new AxeBuilder({ page }).withTags(RULES)
  if (include) scan = scan.include(include)
  const { violations } = await scan.analyze()
  // soft: the test goes on, so one run lists the problems of every page.
  expect.soft(describe(violations), `${label}: WCAG 2.1 AA problems`).toEqual([])
}
