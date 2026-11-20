/* Icon dạng nét (stroke = currentColor), viewBox 24 — giống demo/assets/render.js. */
export const ICONS: Record<string, string> = {
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="3.8"/><circle cx="17" cy="7" r="1" fill="currentColor" stroke="none"/>',
  tiktok: '<path d="M14 3.5v11a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3.5c.5 2.6 2.4 4.4 5 4.6"/>',
  facebook: '<circle cx="12" cy="12" r="8.5"/><path d="M14.8 8.2h-1.3a2.3 2.3 0 0 0-2.3 2.3v10M8.8 13h5.6"/>',
  twitter: '<path d="M4.5 4.5l15 15M19.5 4.5l-15 15"/>',
  youtube: '<rect x="3" y="5.5" width="18" height="13" rx="4"/><path d="M10.3 9.4v5.2l4.4-2.6z" fill="currentColor"/>',
  website: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5z"/>',
  zalo: '<path d="M4.5 5.5h15v10.5h-9l-6 4z"/>',
  spotify: '<circle cx="12" cy="12" r="8.5"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.5c2.5-.7 5.2-.4 7.3.8M8.6 15.3c2-.5 4-.3 5.6.6"/>',
  home: '<path d="M4.5 10.5 12 4.5l7.5 6V19a1 1 0 0 1-1 1h-4v-5h-5v5h-4a1 1 0 0 1-1-1z"/>',
  play: '<rect x="3.5" y="5.5" width="17" height="13" rx="4"/><path d="M10.5 9.6v4.8l4-2.4z" fill="currentColor"/>',
  music: '<path d="M9 17.5V6l10-2v11.5"/><circle cx="6.5" cy="17.5" r="2.5"/><circle cx="16.5" cy="15.5" r="2.5"/>',
  disc: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="2.5"/>',
  ticket: '<path d="M4 8.5a2 2 0 0 0 2-2h12a2 2 0 0 0 2 2v1.5a2 2 0 0 0 0 4v1.5a2 2 0 0 0-2 2H6a2 2 0 0 0-2-2V14a2 2 0 0 0 0-4z"/><path d="M14.5 7v10" stroke-dasharray="1.5 2"/>',
  bag: '<path d="M5.5 8h13l-1 12h-11z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/>',
  mail: '<rect x="3.5" y="5.5" width="17" height="13" rx="3"/><path d="m4.5 7.5 7.5 5.5 7.5-5.5"/>',
  star: '<path d="m12 4.5 2.3 4.8 5.2.6-3.9 3.6 1.1 5.2L12 16.1l-4.7 2.6 1.1-5.2-3.9-3.6 5.2-.6z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  tag: '<path d="M4 12.5V4.5h8l8 8-8 8z"/><circle cx="8.3" cy="8.8" r="1.4"/>',
  bolt: '<path d="M13 3.5 5.5 13.5h6l-1 7 7.5-10h-6z"/>',
  "arrow-ur": '<path d="M7.5 16.5l9-9M9 7.5h7.5V15"/>',
  "arrow-l": '<path d="M19 12H5.5M11 6.5 5.5 12l5.5 5.5"/>',
  "arrow-r": '<path d="M5 12h13.5M13 6.5l5.5 5.5-5.5 5.5"/>',
  triangle: '<path d="M9 6.5v11l9-5.5z" fill="currentColor" stroke-linejoin="round"/>',
};

export const TYPE_ICON: Record<string, string> = {
  "hero-video": "play", carousel: "music", card: "star", link: "link", banner: "tag",
  release: "disc", video: "play", events: "ticket", products: "bag", subscribe: "mail", shop: "bag",
};

export function svg(name: string): string {
  return (
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    (ICONS[name] ?? ICONS.link) +
    "</svg>"
  );
}

/* Placeholder gradient khi chưa có ảnh, biến thể theo id. */
const BLOBS = [
  "radial-gradient(circle at 28% 22%,#E6CA9A 0,transparent 58%),radial-gradient(circle at 78% 82%,#B9CB5C 0,transparent 55%),#DCE5AE",
  "radial-gradient(circle at 75% 20%,#E6CA9A 0,transparent 55%),radial-gradient(circle at 20% 85%,#CBD77E 0,transparent 60%),#EEF0E2",
  "radial-gradient(circle at 30% 75%,#E6CA9A 0,transparent 60%),radial-gradient(circle at 80% 25%,#CBD77E 0,transparent 55%),#E9EBDD",
  "radial-gradient(circle at 50% 15%,#F1E2C4 0,transparent 60%),radial-gradient(circle at 60% 90%,#CBD77E 0,transparent 55%),#DDE3BF",
];
function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}
export const blob = (seed: unknown) => BLOBS[hash(String(seed ?? "")) % BLOBS.length];
export const cssUrl = (url: string) => 'url("' + url.replace(/"/g, "") + '")';

/** style cho ô ảnh: ảnh cover, hoặc gradient nếu chưa có ảnh. */
export function coverStyle(url: string | undefined, seed: unknown): string {
  return url ? `background-image:${cssUrl(url)};background-size:cover;background-position:center` : `background:${blob(seed)}`;
}
/** style cho artwork đặt giữa nền màu (bìa release / video). */
export function artStyle(url: string | undefined, bg: string | undefined, seed: unknown): string {
  if (!url && !bg) return `background:${blob(seed)}`;
  return `background-color:${bg || "#E9EBDD"}` + (url ? `;background-image:${cssUrl(url)}` : "");
}
