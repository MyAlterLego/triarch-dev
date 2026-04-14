export function About() {
  return (
    <section className="border-t border-border px-6 py-24">
      <div className="mx-auto max-w-5xl">
        <div className="mb-20 flex flex-col items-center text-center">
          <img
            src="/triarch-logo.png"
            alt="Triarch Development"
            className="mb-8 h-48 w-48 object-contain md:h-64 md:w-64"
          />
          <h2 className="mb-6 text-3xl font-bold tracking-tight md:text-4xl">
            The development arm of{" "}
            <a
              href="https://www.triarchsecurity.com"
              target="_blank"
              rel="noopener noreferrer"
              className="text-accent transition-colors hover:text-accent-hover"
            >
              Triarch Security
            </a>
            .
          </h2>
          <p className="max-w-2xl text-lg text-muted leading-relaxed">
            Same LLC. Same standards. Different mission. While Triarch Security
            hardens your narrative and strategy, Triarch Development builds the
            systems that power your operations. We&apos;re not a dev shop that
            churns out MVPs &mdash; we&apos;re engineers who build tools
            we&apos;d use ourselves.
          </p>
        </div>

        <div className="grid gap-8 md:grid-cols-3">
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-3 text-4xl font-bold text-accent">100%</p>
            <p className="text-sm text-muted leading-relaxed">
              Custom-built. No templates, no drag-and-drop, no
              &ldquo;platforms.&rdquo;
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-3 text-4xl font-bold text-accent">AI-Native</p>
            <p className="text-sm text-muted leading-relaxed">
              Every system we build leverages AI where it actually adds value
              &mdash; not as a buzzword.
            </p>
          </div>
          <div className="rounded-2xl border border-border bg-surface p-8 text-center">
            <p className="mb-3 text-4xl font-bold text-accent">Owner-Built</p>
            <p className="text-sm text-muted leading-relaxed">
              No outsourcing. No junior devs learning on your dime. Senior
              engineering, direct.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
