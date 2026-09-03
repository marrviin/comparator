/** Sidebar toggle glyph: rounded box with a vertical divider near the left,
 *  reading as "a panel". Stroke follows currentColor so it inherits the Icon color. */
export function SidebarToggleSvg() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 16 16"
      fill="none"
      width="1em"
      height="1em"
    >
      <rect
        x="1.75"
        y="1.75"
        width="12.5"
        height="12.5"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.25"
        fill="none"
      />
      <path d="M6 2.5v11" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}
