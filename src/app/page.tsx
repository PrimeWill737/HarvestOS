import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import { ArrowUpRight, Leaf, ShieldCheck, Truck, BarChart3, MoveRight } from 'lucide-react';
export default function Home() {
  return (
    <>
      <header className="public-header">
        <Link className="brand" href="/">
          <BrandMark />
          Harvest<span>OS</span>
        </Link>
        <nav>
          <Link href="/how-it-works">How it works</Link>
          <Link href="/farmers">For farmers</Link>
          <Link href="/buyers">For buyers</Link>
          <Link href="/impact">Our approach</Link>
        </nav>
        <Link className="button outline" href="/auth/login">
          Sign in <ArrowUpRight size={16} />
        </Link>
      </header>
      <main id="main">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">
              <span className="dot" /> ROOTED IN PLATEAU. BUILT FOR POSSIBILITY.
            </span>
            <h1>
              Every harvest
              <br />
              deserves
              <br />
              <em>a market.</em>
            </h1>
            <p>
              Good produce shouldn’t go to waste while buyers are looking for it. Bring harvests,
              demand and the people who move them into one shared workspace.
            </p>
            <div className="actions">
              <Link href="/auth/register?role=farmer" className="button">
                Register your harvest <ArrowUpRight size={18} />
              </Link>
              <Link href="/workspace/operations" className="text-link">
                Explore the workspace <MoveRight size={18} />
              </Link>
            </div>
            <div className="hero-note">
              <ShieldCheck size={18} /> Clear records. Explainable decisions. Verified outcomes.
            </div>
          </div>
          <div className="hero-art">
            <div className="field-lines" />
            <div className="harvest-label">
              THE NEXT CHAPTER OF AGRICULTURE <span>01 / PLATEAU</span>
            </div>
            <div className="produce">
              <i />
              <i />
              <i />
              <i />
              <i />
            </div>
            <div className="floating-note">
              <span className="dot" /> CONNECT BEFORE THE HARVEST
              <h3>
                A better route
                <br />
                from farm to buyer.
              </h3>
              <span>Supply → Demand → Delivery</span>
            </div>
            <div className="art-caption">TOMATOES FIRST. LASTING CONNECTIONS NEXT.</div>
          </div>
        </section>
        <section className="trust-strip">
          <span>ONE CONNECTED SUPPLY CHAIN</span>
          <Link href="/farmers">Farmers</Link>
          <Link href="/buyers">Buyers</Link>
          <Link href="/logistics">Transport partners</Link>
          <Link href="/storage">Storage operators</Link>
          <span>Cooperatives</span>
        </section>
        <section className="section">
          <div className="section-heading">
            <span className="eyebrow">FROM UNCERTAINTY TO COORDINATION</span>
            <h2>
              More than a listing.
              <br />A plan for what happens next.
            </h2>
            <p>Keep the records, understand the urgency, and coordinate a real transaction.</p>
          </div>
          <div className="feature-grid">
            {[
              [
                Leaf,
                '01',
                'Make supply visible',
                'Register crop, grade, quantity and harvest dates. Know what is available, reserved, sold or lost.',
              ],
              [
                Truck,
                '02',
                'Find a feasible route',
                'Match verified demand, compare costs and coordinate transport or suitable storage.',
              ],
              [
                BarChart3,
                '03',
                'Close the loop',
                'Record receipt, resolve discrepancies and measure only outcomes backed by evidence.',
              ],
            ].map(([Icon, n, title, body]) => {
              const I = Icon as typeof Leaf;
              return (
                <article className="feature" key={String(n)}>
                  <div>
                    <I />
                    <span>{String(n)}</span>
                  </div>
                  <h3>{String(title)}</h3>
                  <p>{String(body)}</p>
                </article>
              );
            })}
          </div>
        </section>
        <section className="cta-band">
          <div>
            <span className="eyebrow">A SHARED WORKSPACE FOR EVERY STAKEHOLDER</span>
            <h2>
              Your next harvest starts
              <br />
              with a better connection.
            </h2>
          </div>
          <Link className="button lime" href="/auth/register">
            Join HarvestOS <ArrowUpRight size={18} />
          </Link>
        </section>
      </main>
      <footer>
        <Link className="brand" href="/">
          <BrandMark />
          HarvestOS
        </Link>
        <p>Every harvest deserves a market.</p>
        <nav>
          <Link href="/about">About</Link>
          <Link href="/contact">Contact</Link>
          <Link href="/privacy">Privacy</Link>
          <Link href="/terms">Terms</Link>
        </nav>
        <small>Plateau State, Nigeria · Prototype platform. No unverified impact claims.</small>
      </footer>
    </>
  );
}
