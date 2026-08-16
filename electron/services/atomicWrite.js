// Atomic file write helper / ファイルのアトミック書き込みヘルパー
import fs from 'fs';
import path from 'path';

/**
 * Write a file by staging it next to the target and renaming over it.
 * Used for files owned by Steam/SteamVR: a truncated in-place write (crash,
 * full disk, concurrent writer) would corrupt settings unrelated to this app.
 * rename() replaces an existing target on both Windows and POSIX.
 * 一時ファイルに書いてからリネームで置き換える形で書き込む。
 * Steam/SteamVR 所有のファイルに使用する。その場書き換え中にクラッシュや
 * ディスク不足、同時書き込みが起きると本アプリと無関係な設定まで壊れるため。
 * rename() は Windows / POSIX いずれでも既存ファイルを置き換える。
 */
export function writeFileAtomicSync(filePath, contents) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(
    dir,
    `.${path.basename(filePath)}.${process.pid}.tmp`,
  );
  try {
    fs.writeFileSync(tempPath, contents, 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (error) {
    // Leave no stray temp file behind / 一時ファイルを残さない
    try {
      fs.rmSync(tempPath, { force: true });
    } catch {
      /* Ignore cleanup errors / クリーンアップエラーは無視 */
    }
    throw error;
  }
}
