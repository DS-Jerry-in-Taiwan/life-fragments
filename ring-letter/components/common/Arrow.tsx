/** The drawn → after a primary action (DESIGN.md: no arrow characters as icons). Hidden from assistive tech, so it never changes a control's name. */
export default function Arrow() {
  return (
    <svg
      className="arrow"
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  );
}
