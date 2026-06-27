import fs from 'fs';
import path from 'path';
import iconv from 'iconv-lite';
import jschardet from 'jschardet';

// Windows-1255 Hebrew letters occupy 0xE0–0xFA. If the majority of
// non-ASCII bytes fall in that range, the file is almost certainly
// Windows-1255 regardless of what the generic detector thinks.
function looksLikeWindows1255(buf: Buffer): boolean {
  let hebrewBytes = 0;
  let highBytes = 0;
  for (let i = 0; i < buf.length; i++) {
    const b = buf[i];
    if (b !== undefined && b > 0x7f) {
      highBytes++;
      if (b >= 0xe0 && b <= 0xfa) hebrewBytes++;
    }
  }
  return highBytes > 0 && hebrewBytes / highBytes >= 0.6;
}

export async function normalizeSubtitle(inputPath: string, destPath: string): Promise<string> {
  const raw = fs.readFileSync(inputPath);

  // Strip UTF-8 BOM
  const stripped = raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf ? raw.slice(3) : raw;

  const detected = jschardet.detect(stripped);
  const detectedEncoding = (detected.encoding || '').toLowerCase();
  const confidence = detected.confidence ?? 0;

  let text: string;
  if (detectedEncoding === 'utf-8' && confidence > 0.9) {
    text = stripped.toString('utf8');
  } else if (looksLikeWindows1255(stripped)) {
    text = iconv.decode(stripped, 'windows-1255');
  } else if (detectedEncoding === 'ascii' || detectedEncoding === 'utf-8') {
    text = stripped.toString('utf8');
  } else if (detectedEncoding) {
    text = iconv.decode(stripped, detectedEncoding);
  } else {
    // Fallback: assume UTF-8
    text = stripped.toString('utf8');
  }

  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, text, 'utf8');
  return destPath;
}
