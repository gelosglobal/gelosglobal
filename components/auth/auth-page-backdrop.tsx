/** Shared grid + gradient backdrop for auth pages */
export function AuthPageBackdrop() {
  return (
    <>
      {/* Base canvas */}
      <div
        className="pointer-events-none absolute inset-0 bg-gradient-to-br from-neutral-100 via-background to-muted/80 dark:from-[oklch(0.09_0.01_268)] dark:via-[oklch(0.11_0.012_268)] dark:to-[oklch(0.07_0.008_268)]"
        aria-hidden
      />

      {/* Center radial glow */}
      <div
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,oklch(1_0_0/0.9),transparent_55%)] dark:bg-[radial-gradient(ellipse_90%_70%_at_50%_0%,oklch(0.868_0.214_126.7/0.12),transparent_55%)]"
        aria-hidden
      />

      {/* Grid — light */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.45] [background-image:linear-gradient(to_right,oklch(0_0_0/0.06)_1px,transparent_1px),linear-gradient(to_bottom,oklch(0_0_0/0.06)_1px,transparent_1px)] [background-size:32px_32px] dark:hidden"
        aria-hidden
      />
      {/* Grid — dark */}
      <div
        className="pointer-events-none absolute inset-0 hidden opacity-30 [background-image:linear-gradient(to_right,oklch(1_0_0/0.07)_1px,transparent_1px),linear-gradient(to_bottom,oklch(1_0_0/0.07)_1px,transparent_1px)] [background-size:32px_32px] dark:block"
        aria-hidden
      />

      {/* Soft corner washes */}
      <div
        className="pointer-events-none absolute -left-24 top-[8%] h-96 w-96 rounded-full bg-primary/[0.05] blur-[100px] dark:bg-primary/[0.12]"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -right-20 bottom-[5%] h-80 w-80 rounded-full bg-chart-3/[0.06] blur-[90px] dark:bg-chart-3/[0.14]"
        aria-hidden
      />
    </>
  )
}
