import AxeBuilder from "@axe-core/playwright";
import { asAdmin, expect, settle, test, WIDTHS } from "./fixtures";
import { STATES } from "./states";

// Automated accessibility scan (V5-d, #39): axe-core on every state in
// states.ts, WCAG 2.0 / 2.1 A + AA and WCAG 2.2 AA rules (no best-practice).
// Any violation fails; `incomplete` (axe couldn't decide, e.g. text over the
// night sky's gradient) is logged, and qa.spec.ts checks the contrast of the
// main text itself.

type Result = Awaited<ReturnType<AxeBuilder["analyze"]>>["violations"][number];

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/**
 * The only exceptions (pasted into the PR): a rule id, narrowed to the nodes
 * whose HTML contains `html`, and why. Never a whole rule such as
 * color-contrast for the whole page.
 */
export const EXCEPTIONS: { rule: string; html: string; reason: string }[] = [
  {
    rule: "color-contrast",
    // components/story/StoryPaper.tsx: <div className={styles.end} aria-hidden="true">· · ·</div>
    html: 'aria-hidden="true">· · ·</div>',
    reason:
      "信紙結尾的「· · ·」是裝飾（aria-hidden），不是文字內容；WCAG 1.4.3 不要求純裝飾符合對比。",
  },
];

const excepted = (rule: string, html: string) =>
  EXCEPTIONS.find((e) => e.rule === rule && html.includes(e.html));

function describe(results: Result[]) {
  return results.flatMap((r) =>
    r.nodes.map(
      (n) =>
        `${r.id} (${r.impact ?? "-"}) ${n.target.join(" ")}: ${r.help}\n      ${(n.failureSummary ?? "").replace(/\n/g, " ")} | ${n.html.slice(0, 160)}`,
    ),
  );
}

for (const [label, viewport] of Object.entries(WIDTHS)) {
  test.describe(`axe ${label} ${viewport.width}px`, () => {
    test.use({ viewport });
    for (const state of STATES) {
      test(`axe: ${state.name}`, async ({ page, context }) => {
        if (state.admin) await asAdmin(context);
        await state.open(page, context);
        await settle(page);
        // Let transitions (e.g. a just-pressed button's colours) finish first.
        await page.evaluate(() => Promise.all(document.getAnimations().map((a) => a.finished)));
        const { violations, incomplete } = await new AxeBuilder({ page }).withTags(TAGS).analyze();
        const failing = violations
          .map((v) => ({
            ...v,
            nodes: v.nodes.filter((n) => {
              const e = excepted(v.id, n.html);
              if (e)
                console.log(`[axe] ${state.name} ${viewport.width}: excepted ${v.id}: ${e.reason}`);
              return !e;
            }),
          }))
          .filter((v) => v.nodes.length);
        for (const line of describe(incomplete))
          console.log(`[axe] ${state.name} ${viewport.width} incomplete: ${line}`);
        expect(describe(failing), "axe violations").toEqual([]);
      });
    }
  });
}
