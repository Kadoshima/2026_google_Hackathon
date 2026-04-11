import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Reviewer Zero',
    short_name: 'Reviewer Zero',
    description:
      '投稿前に「説明できるまで出荷しない」を実現する、AI時代の説明責任レイヤー。',
    start_url: '/',
    display: 'standalone',
    background_color: '#f9fafb',
    theme_color: '#111827',
    orientation: 'portrait-primary',
    lang: 'ja',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon'
      }
    ]
  };
}
