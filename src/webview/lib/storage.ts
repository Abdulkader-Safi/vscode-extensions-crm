import { getSupabase } from "./supabase";
import { auth } from "./stores/auth.svelte";

const BUCKET = "crm-files";
const SIGNED_URL_TTL_SECONDS = 60 * 60 * 24 * 365; // 1 year

export type ProfileAssetKind = "avatar" | "logo";

// Upload a profile asset to crm-files/<user_id>/<kind>.<ext> and return a
// long-lived signed URL we can persist on profiles.<kind>_url. `upsert: true`
// overwrites the previous file at the same path so we don't accumulate orphans.
export async function uploadProfileAsset(
  kind: ProfileAssetKind,
  file: File,
): Promise<string> {
  if (!auth.user) {
    throw new Error("Not authenticated");
  }
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const path = `${auth.user.id}/${kind}.${ext}`;
  const supa = getSupabase();
  const { error: upErr } = await supa.storage
    .from(BUCKET)
    .upload(path, file, {
      upsert: true,
      contentType: file.type || `image/${ext}`,
    });
  if (upErr) {
    throw upErr;
  }
  const { data, error } = await supa.storage
    .from(BUCKET)
    .createSignedUrl(path, SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    throw error ?? new Error("Failed to sign URL");
  }
  return data.signedUrl;
}

// Delete the asset (path is reconstructed from the kind only — we know the
// extension of the *current* asset only via the existing signed URL, so we
// list-and-remove anything matching <user_id>/<kind>.* instead).
export async function removeProfileAsset(kind: ProfileAssetKind): Promise<void> {
  if (!auth.user) {
    throw new Error("Not authenticated");
  }
  const supa = getSupabase();
  const { data, error } = await supa.storage
    .from(BUCKET)
    .list(auth.user.id, { search: `${kind}.` });
  if (error) {
    throw error;
  }
  if (!data || data.length === 0) {
    return;
  }
  const paths = data.map((f) => `${auth.user!.id}/${f.name}`);
  const { error: delErr } = await supa.storage.from(BUCKET).remove(paths);
  if (delErr) {
    throw delErr;
  }
}
