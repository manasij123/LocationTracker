import type { CSSProperties } from "react";
import { useTheme } from "../hooks/useTheme";

interface BrandLogoProps {
  className?: string;
  style?: CSSProperties;
}

/** The app's logo, swapping to the dark-theme variant so its outer ring/dots (drawn in a dark
 *  navy in the light version) stay visible against a dark background instead of vanishing. */
export default function BrandLogo({ className, style }: BrandLogoProps) {
  const { resolvedTheme } = useTheme();
  const src = resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo.svg";
  return <img src={src} alt="SpotShare" className={className} style={style} />;
}
