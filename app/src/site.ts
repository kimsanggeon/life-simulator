// 공유 카드 등에 표시할 사이트 주소.
// 1) 빌드할 때 VITE_SITE_URL이 있으면 그 값 (개인 도메인용)
// 2) 없으면 지금 열려 있는 주소 (Vercel 배포 주소가 자동으로 들어감)
// 3) 내 컴퓨터(localhost)에서 볼 때는 빈 문자열 → 카드에 주소 줄을 그리지 않는다

const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\]|0\.0\.0\.0)$|\.local$/;

/** "https://www.example.com/" → "example.com" */
export function displayHost(url: string): string {
  return url
    .trim()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/+$/, '');
}

export function siteHost(env: string | undefined = import.meta.env.VITE_SITE_URL, hostname = globalThis.location?.hostname, host = globalThis.location?.host): string {
  if (env && env.trim()) return displayHost(env);
  if (!hostname || LOCAL.test(hostname)) return '';
  return displayHost(host ?? hostname);
}

/** 공유하기 때 함께 보낼 전체 주소 */
export function siteUrl(): string {
  const h = siteHost();
  return h ? `https://${h}` : '';
}
