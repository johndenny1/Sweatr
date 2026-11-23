import { supabase } from './supabase.js';

// Center-crop to a square and shrink, so uploads are small and always look right in a circle.
function squareJpeg(file, size = 400, quality = 0.86) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(img.width, img.height);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      canvas
        .getContext('2d')
        .drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo"))), 'image/jpeg', quality);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't open that photo"));
    };
    img.src = url;
  });
}

async function removeOld(userId) {
  const { data } = await supabase.storage.from('avatars').list(userId);
  if (data?.length) await supabase.storage.from('avatars').remove(data.map((f) => `${userId}/${f.name}`));
}

export async function uploadAvatar(user, file) {
  const blob = await squareJpeg(file);
  await removeOld(user.id).catch(() => {});
  const path = `${user.id}/avatar-${Date.now()}.jpg`;
  const { error } = await supabase.storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: true });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error('Photo storage isn\'t set up yet (run supabase/avatars.sql)');
    throw error;
  }
  const { data } = supabase.storage.from('avatars').getPublicUrl(path);
  const { data: updated, error: e2 } = await supabase.auth.updateUser({ data: { avatar_url: data.publicUrl } });
  if (e2) throw e2;
  return updated.user;
}

export async function removeAvatar(user) {
  await removeOld(user.id).catch(() => {});
  const { data, error } = await supabase.auth.updateUser({ data: { avatar_url: null } });
  if (error) throw error;
  return data.user;
}
