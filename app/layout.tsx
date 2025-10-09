import type React from "react"
import type { Metadata } from "next"
import { GeistSans } from "geist/font/sans"
import { GeistMono } from "geist/font/mono"
import { Analytics } from "@vercel/analytics/next"
import { Suspense } from "react" // import Suspense to wrap components that may use useSearchParams
import { Github } from "lucide-react"
import "./globals.css"

export const metadata: Metadata = {
  title: "v0 App",
  description: "Created with v0",
  generator: "v0.app",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={`font-sans ${GeistSans.variable} ${GeistMono.variable}`}>
        <Suspense fallback={<div className="p-4 text-muted-foreground text-sm">Loading...</div>}>
          {/* GitHub icon links at four corners */}
          <a
            href="https://github.com/jochristianto"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Profile (top left)"
            title="GitHub: jochristianto"
            className="fixed top-4 left-4 inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground hover:bg-card shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:cursor-pointer"
          >
            <Github className="h-5 w-5" />
            <span className="sr-only">Open GitHub profile</span>
          </a>

          <a
            href="https://github.com/jochristianto"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Profile (top right)"
            title="GitHub: jochristianto"
            className="fixed top-4 right-4 inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground hover:bg-card shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:cursor-pointer"
          >
            <Github className="h-5 w-5" />
            <span className="sr-only">Open GitHub profile</span>
          </a>

          <a
            href="https://github.com/jochristianto"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Profile (bottom left)"
            title="GitHub: jochristianto"
            className="fixed bottom-4 left-4 inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground hover:bg-card shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:cursor-pointer"
          >
            <Github className="h-5 w-5" />
            <span className="sr-only">Open GitHub profile</span>
          </a>

          <a
            href="https://github.com/jochristianto"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub Profile (bottom right)"
            title="GitHub: jochristianto"
            className="fixed bottom-4 right-4 inline-flex items-center justify-center h-10 w-10 rounded-full border border-border bg-card/80 text-muted-foreground hover:text-foreground hover:bg-card shadow-sm backdrop-blur transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring hover:cursor-pointer"
          >
            <Github className="h-5 w-5" />
            <span className="sr-only">Open GitHub profile</span>
          </a>

          {children}
          <Analytics />
        </Suspense>
      </body>
    </html>
  )
}
