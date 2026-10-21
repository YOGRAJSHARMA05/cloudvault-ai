import { Container } from "@/components/ui/Container";
import { Button } from "@/components/ui/Button";
import { Logo } from "@/components/common/Logo";
import { siteNavigation } from "@/constants/site";

export function Navbar() {
  return (
    <header className="sticky top-0 z-50 border-b border-white/8 bg-slate-950/70 backdrop-blur-xl">
      <Container className="flex min-h-20 flex-wrap items-center justify-between gap-x-8 gap-y-3 py-3">
        <Logo />
        <nav aria-label="Main navigation" className="flex flex-wrap items-center gap-x-5 gap-y-2">
          {siteNavigation.map((item) => (
            <a
              className="text-sm text-slate-300 transition duration-200 hover:text-white"
              href={item.href}
              key={item.label}
            >
              {item.label}
            </a>
          ))}
          <a
            className="text-sm text-slate-300 transition duration-200 hover:text-white"
            href="/login"
          >
            Login
          </a>
          <Button className="min-h-10 px-4" href="/signup">
            Sign Up
          </Button>
        </nav>
      </Container>
    </header>
  );
}