// @vitest-environment happy-dom

import type { ReactElement } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Avatar } from "@/v2/shared/ui/Avatar";
import { Breadcrumb } from "@/v2/shared/ui/Breadcrumb";
import { BrandMark } from "@/v2/shared/ui/BrandMark";
import { CheckboxRow } from "@/v2/shared/ui/CheckboxRow";
import { ChecklistItem } from "@/v2/shared/ui/ChecklistItem";
import { Chip } from "@/v2/shared/ui/Chip";
import { CitationMarker } from "@/v2/shared/ui/CitationMarker";
import { CodeChip } from "@/v2/shared/ui/CodeChip";
import { DataTable } from "@/v2/shared/ui/DataTable";
import { DateRangeControl } from "@/v2/shared/ui/DateRangeControl";
import { DiffHighlight } from "@/v2/shared/ui/DiffHighlight";
import { Divider } from "@/v2/shared/ui/Divider";
import { EmptyState } from "@/v2/shared/ui/EmptyState";
import { ExternalLink } from "@/v2/shared/ui/ExternalLink";
import { FilterSelect } from "@/v2/shared/ui/FilterSelect";
import { InfoNote } from "@/v2/shared/ui/InfoNote";
import { InlineAlert } from "@/v2/shared/ui/InlineAlert";
import { KeyValueList } from "@/v2/shared/ui/KeyValueList";
import { LevelBadge } from "@/v2/shared/ui/LevelBadge";
import { LinkWithArrow } from "@/v2/shared/ui/LinkWithArrow";
import { Meter } from "@/v2/shared/ui/Meter";
import { PageHeader } from "@/v2/shared/ui/PageHeader";
import { Panel, PanelHeader } from "@/v2/shared/ui/Panel";
import { Pagination } from "@/v2/shared/ui/Pagination";
import { PointsPill } from "@/v2/shared/ui/PointsPill";
import { ProgressBar } from "@/v2/shared/ui/ProgressBar";
import { RadioCard } from "@/v2/shared/ui/RadioCard";
import { SearchInput } from "@/v2/shared/ui/SearchInput";
import { SectionHeading } from "@/v2/shared/ui/SectionHeading";
import { Segmented } from "@/v2/shared/ui/Segmented";
import { StateLabel } from "@/v2/shared/ui/StateLabel";
import { StatusDot } from "@/v2/shared/ui/StatusDot";
import { StatStrip } from "@/v2/shared/ui/StatStrip";
import { StatTile } from "@/v2/shared/ui/StatTile";
import { Stepper } from "@/v2/shared/ui/Stepper";
import { TextArea } from "@/v2/shared/ui/TextArea";
import { TextField } from "@/v2/shared/ui/TextField";
import { Toast } from "@/v2/shared/ui/Toast";
import { TwoColumn } from "@/v2/shared/ui/TwoColumn";
import { UnderlineTabs } from "@/v2/shared/ui/UnderlineTabs";

const smokeCases: ReadonlyArray<[string, () => ReactElement]> = [
  ["Panel", () => <Panel>Panel</Panel>],
  ["PanelHeader", () => <PanelHeader title="Panel" />],
  ["PageHeader", () => <PageHeader title="Page" />],
  ["SectionHeading", () => <SectionHeading>Section</SectionHeading>],
  ["TwoColumn", () => <TwoColumn main="Main" rightRail="Rail" />],
  ["Divider", () => <Divider />],
  ["Breadcrumb", () => <Breadcrumb items={[{ label: "Today", current: true }]} />],
  ["UnderlineTabs", () => <UnderlineTabs items={[{ value: "one", label: "One" }]} value="one" />],
  ["Segmented", () => <Segmented items={[{ value: "one", label: "One" }]} value="one" />],
  ["Pagination", () => <Pagination page={1} pageCount={2} onPageChange={() => undefined} />],
  ["Chip", () => <Chip tone="brand">Brand</Chip>],
  ["StatusDot", () => <StatusDot tone="ok" label="Ready" />],
  ["StateLabel", () => <StateLabel state="verified" />],
  ["PointsPill", () => <PointsPill points={10} />],
  [
    "DataTable",
    () => <DataTable columns={[{ key: "name", header: "Name" }]} rows={[{ name: "One" }]} />,
  ],
  ["KeyValueList", () => <KeyValueList items={[{ label: "Status", value: "Ready" }]} />],
  ["StatTile", () => <StatTile label="Score" value="92" />],
  ["StatStrip", () => <StatStrip items={[{ label: "Score", value: "92" }]} />],
  ["ProgressBar", () => <ProgressBar value={70} label="Progress" />],
  ["Meter", () => <Meter value={70} label="Progress" />],
  [
    "Stepper",
    () => (
      <Stepper
        steps={[
          { label: "One", status: "completed" },
          { label: "Two", status: "active" },
        ]}
      />
    ),
  ],
  ["LevelBadge", () => <LevelBadge level={3} name="Builder" />],
  ["ChecklistItem", () => <ChecklistItem status="done" label="Checked" />],
  ["SearchInput", () => <SearchInput value="" onChange={() => undefined} />],
  ["FilterSelect", () => <FilterSelect options={[{ value: "all", label: "All" }]} value="all" />],
  ["TextField", () => <TextField label="Name" />],
  ["TextArea", () => <TextArea label="Notes" />],
  ["RadioCard", () => <RadioCard name="plan" value="one" label="One" />],
  ["CheckboxRow", () => <CheckboxRow label="Accept" />],
  ["DateRangeControl", () => <DateRangeControl start="Sep 1" end="Sep 7" />],
  ["InfoNote", () => <InfoNote>Note</InfoNote>],
  ["InlineAlert", () => <InlineAlert tone="warn">Alert</InlineAlert>],
  ["EmptyState", () => <EmptyState title="Nothing here" />],
  ["Toast", () => <Toast tone="ok" message="Saved" />],
  ["CodeChip", () => <CodeChip value="/robots.txt" />],
  ["LinkWithArrow", () => <LinkWithArrow href="#one">Open</LinkWithArrow>],
  ["ExternalLink", () => <ExternalLink href="https://example.com">Source</ExternalLink>],
  ["Avatar", () => <Avatar initials="VC" />],
  ["BrandMark", () => <BrandMark letter="V" />],
  ["DiffHighlight", () => <DiffHighlight kind="inserted">Added</DiffHighlight>],
  ["CitationMarker", () => <CitationMarker index={1} />],
];

describe("v2 shared UI", () => {
  it.each(smokeCases)("renders %s", (_name, create) => {
    const { container } = render(create());

    expect(container.firstElementChild).toBeInTheDocument();
  });

  it("right-aligns numeric table columns with tabular numbers", () => {
    const { container } = render(
      <DataTable
        columns={[
          { key: "label", header: "Label" },
          { key: "score", header: "Score", numeric: true },
        ]}
        rows={[{ label: "One", score: 12 }]}
      />,
    );

    const scoreCell = container.querySelector("tbody td:last-child");
    expect(scoreCell).toHaveClass("text-right", "tabular-nums");
  });

  it("renders empty and loading table rows", () => {
    const columns = [{ key: "label", header: "Label" }] as const;

    const empty = render(<DataTable columns={columns} rows={[]} emptyMessage="No rows" />);
    expect(empty.getByText("No rows")).toBeInTheDocument();
    empty.unmount();

    const loading = render(<DataTable columns={columns} rows={[]} loading loadingRows={2} />);
    expect(loading.getAllByText("Loading")).toHaveLength(2);
  });

  it("uses a distinct word for every state label", () => {
    const states = [
      "verified",
      "needs-review",
      "user-confirmation",
      "not-measured",
      "failed",
      "stale",
      "no-finding",
    ] as const;
    const labels = states.map(
      (state) => render(<StateLabel state={state} />).container.textContent,
    );

    expect(new Set(labels).size).toBe(states.length);
  });

  it("uses a distinct glyph for every state label", () => {
    const states = [
      "verified",
      "needs-review",
      "user-confirmation",
      "not-measured",
      "failed",
      "stale",
      "no-finding",
    ] as const;
    const glyphs = states.map((state) =>
      render(<StateLabel state={state} />)
        .container.querySelector("[data-glyph]")
        ?.getAttribute("data-glyph"),
    );

    expect(new Set(glyphs).size).toBe(states.length);
  });

  it("gives each chip tone a distinct tone class", () => {
    const tones = ["neutral", "brand", "ok", "warn", "bad", "outline"] as const;
    const classes = tones.map(
      (tone) => render(<Chip tone={tone}>{tone}</Chip>).container.firstElementChild?.className,
    );

    expect(new Set(classes).size).toBe(tones.length);
  });

  it("marks exactly one step as active", () => {
    const { container } = render(
      <Stepper
        steps={[
          { label: "Done", status: "completed" },
          { label: "Current", status: "active" },
          { label: "Next", status: "pending" },
        ]}
      />,
    );

    expect(container.querySelectorAll('[data-v2-step-state="active"]')).toHaveLength(1);
  });

  it("calls pagination with the selected page", () => {
    let selectedPage = 0;
    render(<Pagination page={1} pageCount={3} onPageChange={(page) => (selectedPage = page)} />);

    fireEvent.click(screen.getByRole("button", { name: "Go to page 2" }));

    expect(selectedPage).toBe(2);
  });

  it("does not put literal hex colors in inline styles", () => {
    const { container } = render(
      <div>
        {smokeCases.map(([name, create]) => (
          <div data-smoke={name} key={name}>
            {create()}
          </div>
        ))}
      </div>,
    );

    const inlineStyles = [...container.querySelectorAll<HTMLElement>("[style]")].map(
      (element) => element.getAttribute("style") ?? "",
    );

    expect(inlineStyles.join(" ")).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });
});
