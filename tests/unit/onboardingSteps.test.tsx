// @vitest-environment happy-dom
//
// Render tests for the Who and Save steps: the client audience requires an
// agency name before Continue enables, and Save's Create account button
// gates on shared/passwordPolicy.ts's four live rules plus a valid email.
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

import { WhoStep, SaveStep } from "@/components/onboarding/LeftSteps";

describe("WhoStep", () => {
  function setup(overrides: Partial<React.ComponentProps<typeof WhoStep>> = {}) {
    const onAudienceChange = vi.fn();
    const onAgencyNameChange = vi.fn();
    const onSubmit = vi.fn();
    render(
      <WhoStep
        brandName="Venture PR"
        domain="venturepr.com"
        favicon="https://x/y.png"
        audience={null}
        agencyName=""
        onAudienceChange={onAudienceChange}
        onAgencyNameChange={onAgencyNameChange}
        onSubmit={onSubmit}
        submitting={false}
        {...overrides}
      />,
    );
    return { onAudienceChange, onAgencyNameChange, onSubmit };
  }

  it("disables Continue until an audience is picked", () => {
    setup();
    expect(screen.getByTestId("button-who-continue")).toBeDisabled();
  });

  it("keeps Continue disabled for a client audience with no agency name", () => {
    setup({ audience: "client", agencyName: "" });
    expect(screen.getByTestId("button-who-continue")).toBeDisabled();
  });

  it("enables Continue for a client audience once an agency name is entered", () => {
    setup({ audience: "client", agencyName: "Northside Partners" });
    expect(screen.getByTestId("button-who-continue")).not.toBeDisabled();
  });

  it("enables Continue immediately for the own-brand audience", () => {
    setup({ audience: "own" });
    expect(screen.getByTestId("button-who-continue")).not.toBeDisabled();
  });

  it("shows the agency name field only for the client audience", () => {
    setup({ audience: "own" });
    expect(screen.queryByTestId("input-agency-name")).not.toBeInTheDocument();
  });

  it("calls onAudienceChange when a card is clicked", () => {
    const { onAudienceChange } = setup();
    fireEvent.click(screen.getByTestId("option-audience-client"));
    expect(onAudienceChange).toHaveBeenCalledWith("client");
  });
});

describe("SaveStep", () => {
  function setup(overrides: Partial<React.ComponentProps<typeof SaveStep>> = {}) {
    const onSubmit = vi.fn();
    render(
      <SaveStep
        brandName="Venture PR"
        topics={null}
        promptsTested={3}
        email=""
        password=""
        onEmailChange={vi.fn()}
        onPasswordChange={vi.fn()}
        onSubmit={onSubmit}
        submitting={false}
        submitError={null}
        sent={false}
        onResend={vi.fn()}
        resending={false}
        {...overrides}
      />,
    );
    return { onSubmit };
  }

  it("disables Create account with no email or password", () => {
    setup();
    expect(screen.getByTestId("button-create-account")).toBeDisabled();
  });

  it("disables Create account when the password fails a rule (no uppercase)", () => {
    setup({ email: "alex@venturepr.com", password: "venture2" });
    expect(screen.getByTestId("button-create-account")).toBeDisabled();
  });

  it("disables Create account for an invalid email even with a valid password", () => {
    setup({ email: "not-an-email", password: "Venture2026" });
    expect(screen.getByTestId("button-create-account")).toBeDisabled();
  });

  it("enables Create account once the email is valid and all four password rules pass", () => {
    setup({ email: "alex@venturepr.com", password: "Venture2026" });
    expect(screen.getByTestId("button-create-account")).not.toBeDisabled();
  });

  it("renders the confirm-email state instead of the form once sent", () => {
    setup({ email: "alex@venturepr.com", sent: true });
    expect(screen.getByText("Confirm your email")).toBeInTheDocument();
    expect(screen.queryByTestId("button-create-account")).not.toBeInTheDocument();
    expect(screen.getByText("Send it again")).toBeInTheDocument();
  });
});
