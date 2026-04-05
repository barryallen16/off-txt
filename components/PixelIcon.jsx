import Svg, { Path } from "react-native-svg";
import { colors } from "../lib/theme";

// Path data from pixelarticons (MIT, halfmage/pixelarticons), 24x24 grid.
// Inlined so the fill follows the color prop instead of a baked-in black.
const ICONS = {
  "arrow-left":
    "M20 11v2H4v-2zM8 13v2H6v-2zm2 2v2H8v-2zm2 2v2h-2v-2zm-4-6V9H6v2z M10 15V7H8v8zm2 2V5h-2v12z",
  "arrow-right":
    "M4 11v2h16v-2zm12 2v2h2v-2zm-2 2v2h2v-2zm-2 2v2h2v-2zm4-6V9h2v2z M14 15V7h2v8zm-2 2V5h2v12z",
  bell:
    "M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v7H5zm12 0h2v7h-2zM3 13h2v4H3zm16 0h2v4h-2z M3 15h18v2H3zm5 3h2v2H8zm6 0h2v2h-2zm-4 2h4v2h-4z",
  check:
    "M10 18H8v-2h2v2Zm-2-2H6v-2h2v2Zm4-2v2h-2v-2h2Zm-6 0H4v-2h2v2Zm8 0h-2v-2h2v2Zm2-2h-2v-2h2v2Zm2-2h-2V8h2v2Zm2-2h-2V6h2v2Z",
  clock:
    "M6 2h12v2H6zM2 6h2v12H2zm18 0h2v12h-2zm-2-2h2v2h-2zM4 4h2v2H4zm2 18h12v-2H6zm12-2h2v-2h-2zM4 20h2v-2H4zm7-14h2v7h-2zm2 7h2v2h-2zm2 2h2v2h-2z",
  close:
    "M7 19H5V17H7V19ZM19 19H17V17H19V19ZM9 15V17H7V15H9ZM17 17H15V15H17V17ZM11 15H9V13H11V15ZM15 15H13V13H15V15ZM13 13H11V11H13V13ZM11 11H9V9H11V11ZM15 11H13V9H15V11ZM9 9H7V7H9V9ZM17 9H15V7H17V9ZM7 7H5V5H7V7ZM19 7H17V5H19V7Z",
  image:
    "M3 5h18v2H3zM3 17h18v2H3zM3 7h2v10H3zM19 7h2v10h-2zM6 14h2v2H6zm2-2h2v2H8zm2-2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zm2 2h2v2h-2zM16 9h2v2h-2z",
  inbox:
    "M2 4h2v16H2zm2 16h16v2H4zM20 4h2v16h-2zM4 2h16v2H4zm0 12h4v2H4zm4 2h8v2H8zm8-2h4v2h-4z",
  location:
    "M9 2h6v2H9zM7 4h2v2H7zm8 0h2v2h-2zM5 6h2v6H5zm12 0h2v6h-2zM7 12h2v2H7zm8 0h2v2h-2zM9 14h6v2H9zm2 2h2v2h-2zm0 2h2v6h-2z",
  qr:
    "M3 3h6v6H3zM15 3h6v6h-6zM3 15h6v6H3zM12 12h3v3h-3zM17 12h3v3h-3zM14 14h3v3h-3zM12 17h3v3h-3zM18 17h3v3h-3z",
  "message-text":
    "M20 2H4v2h16zm0 14H6v2h14zm2-12h-2v12h2zM4 4H2v18h2zm2 14H4v2h2zm0-6h4v2H6zm0-4h8v2H6z",
  phone:
    "M4 1h5v2H4zm5 2h2v4H9zM7 7h2v4H7zm-3 5h2v2H4zM2 3h2v9H2zm7 8h2v2H9zm2 2h2v2h-2zm2 2h4v2h-4zm4-2h4v2h-4zm4 2h2v5h-2zM6 14h2v2H6zm2 2h2v2H8zm2 2h2v2h-2zm2 2h9v2h-9z",
  reload:
    "M16 4h2v6h-2zm-2-2h2v2h-2zm0 2h2v8h-2zM4 8H2v5h2z M4 6h16v2H4zm4 14H6v-6h2zm2 2H8v-2h2zm0-2H8v-8h2zm10-4h2v-5h-2z M20 18H4v-2h16z",
  search:
    "M22 22h-2v-2h2v2Zm-2-2h-2v-2h2v2Zm-6-2H6v-2h8v2Zm4 0h-2v-2h2v2ZM6 16H4v-2h2v2Zm10 0h-2v-2h2v2ZM4 14H2V6h2v8Zm14 0h-2V6h2v8ZM6 6H4V4h2v2Zm10 0h-2V4h2v2Zm-2-2H6V2h8v2Z",
  send:
    "M4 19h4v2H2v-8h2v6Zm8 0H8v-2h4v2Zm4-2h-4v-2h4v2Zm4-2h-4v-2h4v2Zm-10-2H4v-2h6v2Zm12 0h-2v-2h2v2ZM8 5H4v6H2V3h6v2Zm12 6h-4V9h4v2Zm-4-2h-4V7h4v2Zm-4-2H8V5h4v2Z",
  star:
    "M12 2h2v2h2v2h2v2h2v2h2v2h-3v2h1v2h1v2h1v6h-6v-2h-2v-2h-2v2h-2v2H4v-6h1v-2h1v-2h1v-2H4V8h2V6h2V4h2V2h2z",
  shield:
    "M4 2h16v2H4zM2 4h2v10H2zm18 0h2v10h-2zM4 14h2v2H4zm2 2h2v2H6zm4 4h4v2h-4zm10-6h-2v2h2zm-2 2h-2v2h2zm-2 2h-2v2h2zm-6 0H8v2h2z",
  user:
    "M9 2h6v2H9zm0 8h6v2H9zm6-6h2v6h-2zM7 4h2v6H7zM4 18h2v4H4zm14 0h2v4h-2zM8 14h8v2H8zm-2 2h2v2H6zm10 0h2v2h-2z",
};

/**
 * @param {{ name: keyof typeof ICONS, size?: 16 | 24, color?: string }} props
 */
export default function PixelIcon({ name, size = 24, color = colors.text }) {
  const path = ICONS[name];
  if (!path) return null;

  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={color}
      accessible={false}
      focusable={false}
    >
      <Path d={path} />
    </Svg>
  );
}
