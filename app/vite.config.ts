import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 링크 미리보기(og:image, og:url)는 전체 주소여야 카카오톡·페이스북이 읽는다.
 * 개인 도메인(VITE_SITE_URL)이 있으면 그것을, 없으면 Vercel이 빌드 때 주는 배포 주소를 쓴다.
 */
function absoluteOg(siteUrl: string): Plugin {
  return {
    name: 'absolute-og',
    transformIndexHtml(html) {
      if (!siteUrl) return html
      const base = siteUrl.replace(/\/+$/, '')
      return html
        .replace('content="/og.png"', `content="${base}/og.png"`)
        .replace('</head>', `  <meta property="og:url" content="${base}/" />\n  </head>`)
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '')
  const raw = env.VITE_SITE_URL || env.VERCEL_PROJECT_PRODUCTION_URL || ''
  const siteUrl = raw && !/^https?:\/\//.test(raw) ? `https://${raw}` : raw
  return {
    plugins: [react(), absoluteOg(siteUrl)],
  }
})
