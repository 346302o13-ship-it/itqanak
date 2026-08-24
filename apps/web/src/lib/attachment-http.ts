import { extname } from "node:path";

function encodedFilename(value: string): string {
  const wellFormed = [...value]
    .map((character) => {
      const codePoint = character.codePointAt(0) ?? 0xfffd;
      return codePoint >= 0xd800 && codePoint <= 0xdfff ? "\uFFFD" : character;
    })
    .join("");
  return encodeURIComponent(wellFormed).replace(
    /[!'()*]/gu,
    (character) => `%${character.codePointAt(0)?.toString(16).toUpperCase() ?? ""}`,
  );
}

export function attachmentContentDisposition(filename: string): string {
  const extension = extname(filename).toLowerCase();
  const safeExtension = /^\.[a-z0-9]{1,8}$/u.test(extension) ? extension : "";
  return `attachment; filename="itqanak-attachment${safeExtension}"; filename*=UTF-8''${encodedFilename(filename)}`;
}
