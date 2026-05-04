// svelte-i18n bootstrap. Catalogs are imported eagerly (small) so the
// webview doesn't need to fetch them at runtime. We initialise with English
// as a safe fallback; App.svelte syncs `$locale` to `profile.language` once
// the profile loads. Adding a new language: import the JSON, register, and
// add the IETF tag to the Settings <Select> options.

import { addMessages, init, locale } from "svelte-i18n";
import en from "./en.json";
import ar from "./ar.json";

addMessages("en", en);
addMessages("ar", ar);

init({
  fallbackLocale: "en",
  initialLocale: "en",
});

export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

export function isRtl(loc: string | null | undefined): boolean {
  if (!loc) {
    return false;
  }
  return RTL_LOCALES.has(loc.split("-")[0]);
}

export { _, locale } from "svelte-i18n";
