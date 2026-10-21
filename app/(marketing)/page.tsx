import { Button } from "@/components/ui/Button";
import { Container } from "@/components/ui/Container";
import { Section } from "@/components/ui/Section";

export default function Home() {
  return (
    <main className="flex-1">
      <Section
        className="flex min-h-[calc(100svh-5rem)] scroll-mt-24 items-center justify-center py-24 sm:py-32"
        id="home"
      >
        <Container className="flex flex-col items-center text-center">
          <span className="rounded-full border border-blue-400/20 bg-blue-400/5 px-4 py-1.5 text-sm text-blue-200">
            Your files, thoughtfully organized
          </span>
          <h1 className="mt-7 text-4xl font-semibold tracking-tight text-white sm:text-6xl">
            CloudVault AI
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-8 text-slate-300 sm:text-xl">
            Secure AI cloud storage that brings your files and ideas together.
          </p>
          <Button className="mt-9" href="/signup">
            Get Started
          </Button>
        </Container>
      </Section>

      <Section className="scroll-mt-24 border-t border-white/5" id="features">
        <Container>
          <div className="mx-auto max-w-2xl text-center">
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
              Features
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              A clearer way to work with your files
            </h2>
            <p className="mt-4 text-base leading-7 text-slate-400">
              Keep your important work in one secure place, with intelligent
              tools designed to help you find what you need.
            </p>
          </div>
          <div className="mt-12 grid gap-4 sm:grid-cols-3">
            {[
              {
                title: "Secure storage",
                description:
                  "A private home for your documents, images, and everyday work.",
              },
              {
                title: "Find it faster",
                description:
                  "Search across your workspace and get back to the right file.",
              },
              {
                title: "AI-assisted insights",
                description:
                  "Make it easier to understand and work with your documents.",
              },
            ].map((feature) => (
              <article
                className="rounded-2xl border border-white/8 bg-white/[0.03] p-6"
                key={feature.title}
              >
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-3 text-sm leading-6 text-slate-400">
                  {feature.description}
                </p>
              </article>
            ))}
          </div>
        </Container>
      </Section>

      <Section className="scroll-mt-24 border-t border-white/5" id="pricing">
        <Container className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
            Pricing
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Simple plans for your workspace
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-400">
            Choose the storage and tools that fit the way you work. Plan details
            will be available here soon.
          </p>
          <Button className="mt-7" href="/signup" variant="secondary">
            Get started
          </Button>
        </Container>
      </Section>

      <Section className="scroll-mt-24 border-t border-white/5" id="about">
        <Container className="grid items-center gap-8 md:grid-cols-2 md:gap-16">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
              About CloudVault
            </p>
            <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Built around the way your work happens
            </h2>
          </div>
          <p className="text-base leading-8 text-slate-400">
            CloudVault AI brings secure cloud storage and helpful AI tools into
            one calm workspace. Spend less time sorting through files and more
            time focused on what matters.
          </p>
        </Container>
      </Section>

      <Section className="scroll-mt-24 border-t border-white/5" id="contact">
        <Container className="text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.18em] text-blue-300">
            Contact
          </p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            We’re here to help
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-base leading-7 text-slate-400">
            Have a question about CloudVault AI? Send our team a note and we’ll
            get back to you.
          </p>
          <Button className="mt-7" href="mailto:hello@cloudvault.ai" variant="secondary">
            Contact us
          </Button>
        </Container>
      </Section>
    </main>
  );
}