import {
  installOgAlt,
  installOgContentType,
  installOgSize,
  renderInstallOgImage,
} from "@/lib/install-og";

export const alt = installOgAlt;
export const size = installOgSize;
export const contentType = installOgContentType;

export default function OpengraphImage() {
  return renderInstallOgImage();
}
