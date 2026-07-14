import { forwardRef, type SVGProps } from 'react';

/**
 * CompareIcon — custom SVG icon for the Compare nav item.
 *
 * Path supplied verbatim by from the kit's design
 * preview. Lucide-react doesn't ship this exact icon, to render
 * it inline. Drawn at the same 24×24 viewBox as Lucide icons with
 * `stroke="currentColor"` so consumers can color it via the parent's
 * `color` style or via the Lucide-style `color` prop.
 *
 * Matches Lucide's prop surface (`size`, `color`, `strokeWidth`,
 * passthrough SVG props) so it drops into call sites that previously
 * used `GitCompareArrows` without further refactor.
 */
export interface CompareIconProps extends Omit<SVGProps<SVGSVGElement>, 'color'> {
  /** Square dimension in px. Default 24, matching Lucide. */
  size?: number | string;
  /** Stroke color. Default `currentColor`. */
  color?: string;
  /** Default 2 for parity with Lucide stroke style. */
  strokeWidth?: number | string;
}

const CompareIcon = forwardRef<SVGSVGElement, CompareIconProps>(
  ({ size = 24, color = 'currentColor', strokeWidth = 2, ...rest }, ref) => (
    <svg
      ref={ref}
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...rest}
    >
      <path d="M12 5 9 2 6 5M6 2v12a2 2 0 0 0 2 2h2M12 19l3 3 3-3M18 22V10a2 2 0 0 0-2-2h-2" />
    </svg>
  ),
);

CompareIcon.displayName = 'CompareIcon';

export default CompareIcon;
