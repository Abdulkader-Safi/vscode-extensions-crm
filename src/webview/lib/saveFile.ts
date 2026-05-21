import { request } from "./ipc";
import type { SaveFileResult } from "../../shared/messages";

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(
      null,
      Array.from(bytes.subarray(i, i + chunk)),
    );
  }
  return btoa(binary);
}

function textToBase64(text: string): string {
  // UTF-8 safe: encode the string as bytes first, then base64-encode.
  return bytesToBase64(new TextEncoder().encode(text));
}

export function saveTextFile(
  filename: string,
  mimeType: string,
  text: string,
): Promise<SaveFileResult> {
  return request("files/save-file", {
    filename,
    mimeType,
    bytes: textToBase64(text),
  }) as Promise<SaveFileResult>;
}

export function saveBinaryFile(
  filename: string,
  mimeType: string,
  bytes: Uint8Array | ArrayBuffer,
): Promise<SaveFileResult> {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return request("files/save-file", {
    filename,
    mimeType,
    bytes: bytesToBase64(arr),
  }) as Promise<SaveFileResult>;
}
