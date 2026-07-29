import './globals.css'

export const metadata = {
  title: 'Real-time Arabic Voice AI',
  description: 'A low-latency Arabic voice conversation interface using OpenAI Realtime WebRTC',
}

export default function RootLayout({ children }) {
  return (
    <html lang="ar" dir="rtl">
      <body>{children}</body>
    </html>
  )
}
