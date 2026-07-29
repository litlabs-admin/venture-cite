// Shared backdrop behind each Platform mockup: the blue gradient art plus a
// film-grain overlay. Replaces the dot grid the three mockups used to inline
// — the reference retired that treatment when the gradient art landed.
//
// `overflow-hidden` on the wrapper keeps the image inside the mockup cell;
// `pointer-events-none` keeps it out of the way of the mockup's own hovers.
export function MockupBackdrop() {
  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden" aria-hidden="true">
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "url(/venturecite/images/hero-bg.avif)",
          backgroundSize: "100% 100%",
          backgroundPosition: "center bottom",
          backgroundRepeat: "no-repeat",
        }}
      />
      <div className="absolute inset-0 mkt-noise" />
    </div>
  );
}
