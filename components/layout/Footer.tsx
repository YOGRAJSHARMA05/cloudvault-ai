import { siteNavigation, socialLinks } from "@/constants/site";
import { Container } from "@/components/ui/Container";
import { Logo } from "@/components/common/Logo";

export function Footer() {
  return (
    <footer className="border-t border-white/8 bg-slate-950/45">
      <Container className="grid gap-10 py-12 md:grid-cols-[1.3fr_1fr_1fr] md:py-14">
        <div className="space-y-4">
          <Logo />
          <p className="max-w-xs text-sm leading-6 text-slate-400">
            Secure AI cloud storage, thoughtfully built for your files.
          </p>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Quick Links</h2>
          <ul className="mt-4 grid grid-cols-2 gap-x-5 gap-y-3">
            {siteNavigation.map((item) => (
              <li key={item.label}>
                <a
                  className="text-sm text-slate-400 transition duration-200 hover:text-white"
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h2 className="text-sm font-semibold text-white">Connect</h2>
          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-3">
            {socialLinks.map((item) => (
              <li key={item.label}>
                <a
                  aria-label={`${item.label} (coming soon)`}
                  className="text-sm text-slate-400 transition duration-200 hover:text-white"
                  href={item.href}
                >
                  {item.label}
                </a>
              </li>
            ))}
          </ul>
        </div>
        <p className="border-t border-white/8 pt-6 text-xs text-slate-500 md:col-span-3">
          © CloudVault AI. All rights reserved.
        </p>
      </Container>
    </footer>
  );
}