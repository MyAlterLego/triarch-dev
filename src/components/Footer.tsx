const CURRENT_YEAR = new Date().getFullYear();

export function Footer() {

  return (
    <footer className="border-t border-border px-6 py-12">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 md:flex-row">
        <div className="flex flex-col items-center gap-2 md:items-start">
        <div className="flex items-center gap-2">
            <img src="/triarch-logo.png" alt="Triarch Development" className="h-6 w-6 object-contain" />
            <span className="text-lg font-bold tracking-wide uppercase">
              Triarch <span className="font-normal text-accent">Development</span>
            </span>
          </div>
          <p className="text-xs text-muted">
            A division of Triarch Security LLC
          </p>
        </div>

        <div className="flex items-center gap-6 text-sm text-muted">
          <a
            href="https://www.triarchsecurity.com"
            target="_blank"
            rel="noopener noreferrer"
            className="transition-colors hover:text-foreground"
          >
            Triarch Security
          </a>
          <a
            href="#services"
            className="transition-colors hover:text-foreground"
          >
            Services
          </a>
          <a
            href="#contact"
            className="transition-colors hover:text-foreground"
          >
            Contact
          </a>
        </div>

        <p className="text-xs text-muted">
          &copy; {CURRENT_YEAR} Triarch Security LLC. All rights reserved.
        </p>
      </div>
    </footer>
  );
}
