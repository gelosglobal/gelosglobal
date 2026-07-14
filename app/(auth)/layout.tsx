import { ThemeProvider } from '@/components/theme-provider'

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <script
        dangerouslySetInnerHTML={{
          __html: `document.documentElement.classList.add('dark');`,
        }}
      />
      <ThemeProvider forcedTheme="dark">{children}</ThemeProvider>
    </>
  )
}
