import BrandMark from '@/components/BrandMark';
import Link from 'next/link';
import { notFound } from 'next/navigation';
const pages: Record<
  string,
  { title: string; intro: string; sections: [string, string][]; role?: string }
> = {
  'how-it-works': {
    title: 'From a harvest to a verified outcome.',
    intro:
      'HarvestOS connects a dependable record of supply with explainable recommendations and coordinated follow-through.',
    sections: [
      [
        '1. Register supply and demand',
        'Farmers publish measured harvest lots. Verified buyers record crop, grade, quantity, price and collection windows.',
      ],
      [
        '2. Understand the options',
        'Risk scores explain coordination urgency. Matching filters incompatible demand before ranking it. Missing costs and reliability data remain visible.',
      ],
      [
        '3. Confirm and fulfill',
        'An accepted offer reserves stock atomically. Transport and storage providers confirm their assignments. Receipts and discrepancies are recorded.',
      ],
      [
        '4. Verify the outcome',
        'Independent review reconciles actual mass and costs. Recommendations, reservations and verified sales are reported separately.',
      ],
    ],
  },
  farmers: {
    title: 'Give your harvest a head start.',
    intro:
      'Register your farm, publish measured lots and find compatible buyer demand before the collection window closes.',
    role: 'farmer',
    sections: [
      [
        'Your stock, clearly accounted for',
        'See available, reserved, sold and lost quantities across your farms. Local units retain their original meaning; baskets must be weighed before allocation.',
      ],
      [
        'Know the terms',
        'Review offer quantities, deadlines and prices. Accept, reject or propose a counteroffer. Track collection, delivery and settlement evidence.',
      ],
    ],
  },
  buyers: {
    title: 'Plan procurement with confidence.',
    intro:
      'Find compatible produce and coordinate dependable purchases with clear quantity, grade and delivery requirements.',
    role: 'buyer',
    sections: [
      [
        'Verified demand',
        'Create your organization and submit supporting verification evidence. Publish requirements and compare available lots.',
      ],
      [
        'Complete the purchase',
        'Submit offers, confirm received mass and grade, flag discrepancies and record payment references for independent verification.',
      ],
    ],
  },
  logistics: {
    title: 'Move produce when it matters.',
    intro:
      'Make suitable vehicle capacity visible and coordinate confirmed collection and delivery jobs.',
    role: 'transporter',
    sections: [
      [
        'Capacity and availability',
        'Register vehicles, service regions, capacity and suitability. Quote requested jobs and receive confirmed assignments.',
      ],
      [
        'Keep a reliable record',
        'Record dispatch, collection, transit, delivery evidence and actual charges. Failed pickups open incidents. Live tracking is outside this release.',
      ],
    ],
  },
  storage: {
    title: 'Make storage a practical option.',
    intro: 'Connect compatible produce with verified facilities and realistic capacity.',
    role: 'storage_provider',
    sections: [
      [
        'Confirm usable capacity',
        'Publish crops, conditions, prices and available windows. Capacity becomes reserved only after provider confirmation.',
      ],
      [
        'Account for goods',
        'Record actual intake and release quantities with evidence. Overlapping confirmed bookings cannot exceed usable facility capacity.',
      ],
    ],
  },
  impact: {
    title: 'Measure what actually happened.',
    intro: 'A recommendation is not rescued food. An accepted offer is not a completed sale.',
    sections: [
      [
        'Verified outcomes',
        'Report verified sold mass, reported loss, inventory still held and documented transaction costs. Show unknown costs as unknown.',
      ],
      [
        'Avoided loss needs a baseline',
        'No avoided-loss figure is inferred from matching or selling alone. Field studies need a credible comparison methodology, measured mass and independent review.',
      ],
      [
        'Pilot, not proof',
        'The roadmap proposes a Plateau tomato pilot. Participation targets and sample dashboards are planning assumptions, not achieved results.',
      ],
    ],
  },
  about: {
    title: 'A shared operating layer for agriculture.',
    intro:
      'HarvestOS coordinates farmers, buyers, transporters, storage operators and cooperatives around perishable produce.',
    sections: [
      [
        'Start with Plateau',
        'The initial focus is tomatoes in Plateau State, Nigeria. Additional crops and regions follow process validation.',
      ],
      [
        'Build trust through records',
        'Transparent assumptions, auditable decisions and verified outcomes guide the platform. Advanced automation does not commit stock or confirm payments.',
      ],
    ],
  },
  contact: {
    title: 'Let’s coordinate the next harvest.',
    intro:
      'Create an account to request organization verification or raise an operational incident from your workspace.',
    sections: [
      [
        'Operational support',
        'Signed-in participants can record incidents with a description, evidence and the affected order. Coordinators review cases within their assigned region.',
      ],
      [
        'Account and data requests',
        'Use Account ? Privacy requests to request access, correction or deletion. The operator must configure a published support contact before a live pilot.',
      ],
    ],
  },
  privacy: {
    title: 'Privacy and data stewardship.',
    intro:
      'Draft operational notice for the local prototype. The deploying operator must supply its identity, contact, retention periods and legal review before collecting production data.',
    sections: [
      [
        'What the platform records',
        'Account information, organization memberships, farm and harvest records, offers, orders and evidence support coordination and verification.',
      ],
      [
        'Access and sharing',
        'Exact farm locations and private evidence are limited to authorized participants. Supabase provides authentication and PostgreSQL; optional Cloudinary and Resend services process media and notifications when configured.',
      ],
      [
        'Your requests',
        'Request access, correction or deletion through the account workspace. Audit and transaction records may require retention; requests are reviewed rather than silently erasing evidence.',
      ],
      [
        'Production review',
        'Document lawful processing, retention, partner obligations, incident response and cross-border processing before the pilot. This draft is not a legal compliance certification.',
      ],
    ],
  },
  terms: {
    title: 'Platform terms.',
    intro:
      'Draft terms for a coordination prototype. The operator must complete and review these terms before public launch.',
    sections: [
      [
        'Accurate records',
        'Participants must report honest quantities, grades, dates and supporting evidence. Verification does not guarantee a counterparty’s future performance.',
      ],
      [
        'Recommendations and transactions',
        'Scores are prototype coordination indicators, not spoilage probabilities. Offers require explicit acceptance. Service charges and responsibilities must be agreed by the parties.',
      ],
      [
        'Payment and disputes',
        'The platform records payment evidence; it does not process live payments in this release. Unverified references are not confirmed settlement. Use incident workflows for disputes.',
      ],
    ],
  },
};
export default async function Info({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = pages[slug];
  if (!page) notFound();
  return (
    <>
      <header className="public-header">
        <Link className="brand" href="/">
          <BrandMark />
          HarvestOS
        </Link>
        <Link href="/auth/login" className="button outline">
          Sign in
        </Link>
      </header>
      <main id="main" className="info-page">
        <span className="eyebrow">HARVESTOS / {slug.replaceAll('-', ' ')}</span>
        <h1>{page.title}</h1>
        <p className="intro">{page.intro}</p>
        {page.sections.map(([title, body]) => (
          <section key={title}>
            <h2>{title}</h2>
            <p>{body}</p>
          </section>
        ))}
        <Link className="button" href={'/auth/register' + (page.role ? '?role=' + page.role : '')}>
          Create an account
        </Link>
      </main>
    </>
  );
}
