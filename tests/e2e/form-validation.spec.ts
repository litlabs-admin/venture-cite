// tests/e2e/form-validation.spec.ts
//
// Regression coverage for the zod 3 -> 4 / @hookform/resolvers break: zod 4
// removed the `.errors` array that @hookform/resolvers@3.10's zod adapter
// used to detect validation failures (`Array.isArray(error?.errors)`). With
// that combination, the resolver's promise REJECTED instead of resolving to
// `{ errors }`, so react-hook-form never got a validation result: no
// FormMessage ever rendered, and the form silently did nothing on submit.
// Five gates (typecheck, lint, 904 unit tests, 64 e2e tests) missed it
// because no existing test ever submitted a form. Fixed by upgrading to
// @hookform/resolvers@5.5.7.
//
// client/src/pages/brands.tsx is the only zodResolver call site in the app
// (grep-verified: `grep -r zodResolver client/src` has one hit). Its "Add
// Brand Manually" dialog (BrandFormFields.tsx + brands.tsx:641-675) is the
// target here.
//
// Schema under test (brands.tsx:72-116):
//   name: z.string().min(1, "Brand name is required")
//   website: z.string().optional().refine(v => !v || normalizeWebsite(v) !== null,
//     "Enter a valid http(s) URL")
//
// This suite deliberately never lets react-hook-form's handleSubmit reach
// its onSubmit callback (brands.tsx:315-321, which calls
// createMutation.mutate -> POST /api/brands): every scenario either submits
// with an invalid field (blocked client-side - react-hook-form only invokes
// onSubmit once the resolver reports no errors, so an invalid submit makes
// no network call) or fills the form validly and stops short of clicking
// submit. See the task brief: this shared test account's brand list is
// depended on by spine-navigation.spec.ts and welcome-brand.spec.ts, and a
// prior crashed run already broke an unrelated spec once by leaving a stray
// fixture brand behind. Do not add a scenario that lets a real submit through.
import { test, expect } from "@playwright/test";
import { dismissTourIfPresent } from "./support/tour";

test.describe("Brand form client-side validation", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/brands");
    // The product tour auto-fires per browser session and its Shepherd
    // overlay swallows pointer events, so the click below times out with a
    // message that looks like a selector problem but is not. Whether it
    // fires here depends on shared account state and test order - this spec
    // passes in isolation and fails in a full run without this.
    await dismissTourIfPresent(page);
    // Opens the manual-entry dialog and calls form.reset() (brands.tsx:462-467),
    // so every test starts from the same all-empty, all-default form state.
    await page.getByTestId("link-manual-entry").click();
    await expect(page.getByRole("dialog")).toBeVisible();
  });

  test("submitting an empty required field renders the schema's validation message", async ({
    page,
  }) => {
    // Every field starts empty. Clicking submit runs the resolver against
    // the whole schema - this is the exact call whose promise a broken
    // zod4/@hookform-resolvers@3.10 pairing would silently reject, leaving
    // no FormMessage rendered and no createMutation call either way.
    await page.getByTestId("button-save-brand").click();

    await expect(page.getByText("Brand name is required", { exact: true })).toBeVisible();
  });

  test("a malformed website URL renders the refine message, and fixing it clears the message", async ({
    page,
  }) => {
    await page.getByTestId("input-brand-name").fill("E2E Validation Brand");
    await page.getByTestId("input-company-name").fill("E2E Validation Co");
    await page.getByTestId("input-industry").fill("Technology");
    // No dot in the hostname -> normalizeWebsite() returns null
    // (client/src/lib/urlSafety.ts:24: `if (!parsed.hostname.includes("."))
    // return null`), so the .refine() at brands.tsx:84 fails with this exact
    // message.
    await page.getByTestId("input-website").fill("abc");

    await page.getByTestId("button-save-brand").click();

    const websiteError = page.getByText("Enter a valid http(s) URL", { exact: true });
    await expect(websiteError).toBeVisible();
    // Only the website field should be invalid - proves this is a targeted
    // refine failure on the field we broke, not a blanket "form is empty"
    // state that would pass this assertion for the wrong reason.
    await expect(page.getByText("Brand name is required", { exact: true })).not.toBeVisible();

    // Correct the field. react-hook-form's default reValidateMode is
    // "onChange": once a field already has an error, typing a new value
    // re-runs the resolver for that field without needing another submit -
    // deliberately avoided here since a second full-form submit with an
    // otherwise-valid form WOULD call the create-brand mutation.
    await page.getByTestId("input-website").fill("https://example.com");
    await page.getByTestId("input-industry").click(); // blur the website field

    await expect(websiteError).not.toBeVisible();
  });

  test("submit control is enabled and reachable once required fields are valid", async ({
    page,
  }) => {
    await page.getByTestId("input-brand-name").fill("E2E Validation Brand");
    await page.getByTestId("input-company-name").fill("E2E Validation Co");
    await page.getByTestId("input-industry").fill("Technology");

    const saveButton = page.getByTestId("button-save-brand");
    // Proves the control itself is not blocked/disabled once the required
    // fields carry valid values - the last mile before a real submit, which
    // this suite intentionally never triggers (see file header: submitting
    // here would create a real brand in the shared account).
    await expect(saveButton).toBeEnabled();
    await expect(saveButton).toHaveText("Create Brand");
  });
});
