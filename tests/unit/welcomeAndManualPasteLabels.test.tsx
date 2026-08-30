// @vitest-environment happy-dom
//
// B9 UI/UX remainder (B7-20): unlabelled form inputs. Verified against
// current code before fixing - community-engagement.tsx and
// brand-fact-sheet.tsx's own page body turned out to already be fully
// labelled (a prior pass's fix), but welcome.tsx's Confirm-scene fields (9:
// the domain input plus 8 FieldLabel/TagField-driven fields) and
// ManualPasteCard.tsx's paste textarea (1) were genuinely missing a
// programmatic label - each had only a `<label>` with no `htmlFor`, sitting
// as a sibling of its input rather than wrapping it, or (for the domain
// input and the paste textarea) no label at all, just a placeholder.
//
// A placeholder is not an accessible name (and disappears once text is
// typed); a sibling `<label>` with no `htmlFor` is not programmatically
// associated with anything. Both fail `getByLabelText`, which is exactly
// what a screen reader user's "what does this field want" query resolves
// through.
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { FieldLabel, TagField } from "@/pages/welcome";
import { ManualPasteCard } from "@/components/fact-sheet/ManualPasteCard";

describe("welcome.tsx Confirm-scene fields - FieldLabel/TagField associate with their input", () => {
  it("FieldLabel's htmlFor resolves to the paired input's id", () => {
    render(
      <div>
        <FieldLabel label="Brand name" touched={false} htmlFor="confirm-brand-name" />
        <input id="confirm-brand-name" />
      </div>,
    );
    // Throws if the label text isn't programmatically associated with a
    // control - the pre-fix `FieldLabel` (no `htmlFor` prop at all) fails
    // this because the rendered `<label>` carries no `for` attribute.
    expect(screen.getByLabelText("Brand name")).toBeTruthy();
  });

  it("TagField's label associates with its own tag-entry input", () => {
    render(
      <TagField
        label="Products"
        htmlId="confirm-products"
        values={[]}
        touched={false}
        onChange={() => {}}
      />,
    );
    expect(screen.getByLabelText("Products")).toBeTruthy();
  });
});

describe("ManualPasteCard - the paste textarea has a real accessible name", () => {
  it("resolves via getByLabelText, not just its placeholder", () => {
    render(<ManualPasteCard runId="run-1" onSubmit={() => {}} onManualFill={() => {}} />);
    // Before the fix this textarea had no <label>, no aria-label, and no
    // aria-labelledby - only a `placeholder`, which getByLabelText does not
    // treat as an accessible name.
    expect(screen.getByLabelText(/paste your website's about text/i)).toBeTruthy();
  });
});
