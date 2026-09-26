import type { Metadata } from 'next';
import Link from 'next/link';
import { SUPPORT_EMAIL } from '@chefer/types';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The rules for using Chefer, including health, allergen and AI disclaimers.',
};

// Plain-language terms (backlog P0-6, 2026-09-26). Linked from register/login,
// the landing footer, /support, web Profile and the mobile register + More
// screens.
//
// MAINTAINERS: this text was drafted without a lawyer. Have it reviewed by a
// lawyer qualified in Romanian/EU consumer law before any paid launch, and
// before adding prices or payment terms. Bump EFFECTIVE_DATE on every
// material change and tell users about it (see "Changes to these terms").

const EFFECTIVE_DATE = '26 September 2026';

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

export default function TermsPage() {
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Terms of Service</h1>
      <p className="mt-2 text-sm font-medium text-gray-700">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
        <Section title="The short version">
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Chefer helps you plan meals, shop, track food and train. You must be 16 or over.
            </li>
            <li>
              It is not medical advice. Targets are estimates, and allergen checks can miss things.
            </li>
            <li>AI can be wrong. Check what it gives you.</li>
            <li>Premium is free to try for now. We will never charge you without your say-so.</li>
            <li>You can delete your account at any time.</li>
          </ul>
        </Section>

        <Section title="Who we are">
          <p>
            Chefer is run by Pop Dan-Vlad, an individual based in Romania (&ldquo;we&rdquo;,
            &ldquo;us&rdquo;). These terms are the agreement between you and us when you use the
            Chefer website or the iOS and Android app. Our{' '}
            <Link href="/privacy" className={linkClass}>
              Privacy Policy
            </Link>{' '}
            explains how we handle your data.
          </p>
        </Section>

        <Section title="Who can use Chefer">
          <p>
            You must be at least 16 years old to create an account. By creating one, you confirm
            that you are.
          </p>
        </Section>

        <Section title="Your account">
          <p>
            Give us a real email address and keep your password to yourself. You are responsible for
            what happens in your account. If you think someone else has access to it, change your
            password and tell us. One account is for one person; household members you add are
            profiles inside your account, not separate accounts.
          </p>
        </Section>

        <Section title="Using Chefer fairly">
          <p>Please don&apos;t:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>break the law, or upload content you have no right to share;</li>
            <li>upload anything harmful, hateful or sexually explicit;</li>
            <li>
              try to break, overload or get around the limits of the service, including scraping it,
              automated access, or probing it for security holes without our permission;
            </li>
            <li>use Chefer to build a competing service or resell it;</li>
            <li>use another person&apos;s account or pretend to be someone else.</li>
          </ul>
          <p>
            Found a security problem? Please email us rather than testing it further. We are glad to
            hear about it.
          </p>
        </Section>

        <Section title="Your content">
          <p>
            Recipes, photos, notes and other content you add stay yours. Recipes you import or
            create stay in your personal collection and are not shared with other users. To run
            Chefer, you give us a free, non-exclusive licence to store, copy, process and display
            your content, only to provide the service to you: for example to show it on your
            devices, scale your recipes or send it to the AI provider when you use an AI feature.
            The licence ends when you delete the content or your account, apart from backup copies,
            which expire as the Privacy Policy describes.
          </p>
          <p>
            Only import recipes and photos you are allowed to use. Imported recipes are for your
            personal use.
          </p>
        </Section>

        <Section title="Health and nutrition: not medical advice">
          <p>
            Chefer gives general information about food and training. It is not medical, dietetic or
            other professional advice, and it does not replace a doctor, dietitian or qualified
            trainer.
          </p>
          <ul className="list-disc space-y-1 pl-5">
            <li>
              Calorie, protein and other targets, and the nutrition figures for recipes and logged
              meals, are estimates calculated from general formulas and data. They can be wrong for
              you.
            </li>
            <li>
              Talk to a doctor or registered dietitian before you change your diet if you are
              pregnant or breastfeeding, under 18, have a medical condition, take medication, or
              have (or have had) an eating disorder.
            </li>
            <li>
              Exercise carries a risk of injury. Training suggestions are general. Warm up, use a
              weight you can control, stop if something hurts, and check with a doctor before you
              start if you have any health concerns.
            </li>
          </ul>
        </Section>

        <Section title="Allergies: always check yourself">
          <p>
            We filter recipes against the allergies and restrictions you declare, and we take that
            seriously. But automated checks are best effort. Ingredient names can be ambiguous,
            products vary, labels change, and the AI can make mistakes. Always read ingredient lists
            and product labels before you buy, cook or eat. If you or someone you cook for has a
            severe allergy, don&apos;t rely on Chefer alone: check every ingredient yourself.
          </p>
        </Section>

        <Section title="AI features">
          <p>
            Some features use AI to write plans, recipes, answers and nutrition estimates, or to
            read photos. AI output can be wrong, incomplete or out of date, even when it sounds
            sure. Treat it as a suggestion and use your own judgement, especially about allergies,
            food safety and cooking temperatures. AI features send your data to an AI provider only
            with your permission (see the Privacy Policy).
          </p>
        </Section>

        <Section title="Free and Premium">
          <p>
            Chefer has a free tier and a Premium tier with more features and higher daily limits.
            While Chefer is growing, Premium is free to try. If we ever introduce paid plans, we
            will tell you well in advance, inside the app, with the price and terms before you
            decide. Nothing will be charged automatically, and you will not be moved to a paid plan
            without agreeing to it. Daily limits on features may change.
          </p>
        </Section>

        <Section title="Availability and changes">
          <p>
            Chefer is a small independent project that keeps changing. We work to keep it running
            and your data safe, and we keep daily backups, but we cannot promise it will always be
            available or free of errors. We may add, change or remove features. If a change removes
            something important to you, we will tell you in advance where we reasonably can.
          </p>
        </Section>

        <Section title="Ending your account">
          <p>
            You can stop using Chefer and delete your account at any time from{' '}
            <em>Profile → Delete account</em>, on the web or in the app. You can download your data
            first from <em>Profile → Your data</em>.
          </p>
          <p>
            We may suspend or close an account that seriously or repeatedly breaks these terms, or
            where the law requires it. Unless it would be unlawful or put others at risk, we will
            tell you why first and give you a chance to download your data. If we ever shut Chefer
            down, we will give you at least 30 days&apos; notice.
          </p>
        </Section>

        <Section title="Our responsibility">
          <p>
            We provide Chefer with reasonable care and skill. Beyond that, and to the extent the law
            allows, we give no promise that it will meet your particular needs.
          </p>
          <p>
            We are not responsible for losses that we could not reasonably foresee, that were caused
            by your own choices (such as not checking a label or ignoring a medical warning), or
            that are caused by events outside our control.
          </p>
          <p>
            Nothing in these terms limits or excludes our liability for death or personal injury
            caused by our negligence, for fraud, for harm we cause intentionally or through gross
            negligence, or any other liability that cannot be limited under applicable law. Nothing
            in these terms affects your statutory rights as a consumer.
          </p>
        </Section>

        <Section title="Law and disputes">
          <p>
            These terms are governed by Romanian law. If you are a consumer living in the EU, you
            also keep the protection of the mandatory rules of the country where you live, and you
            can bring a claim in the courts of that country as well as in Romania. If something goes
            wrong, please email us first. Most problems can be fixed quickly.
          </p>
        </Section>

        <Section title="Changes to these terms">
          <p>
            We may update these terms, for example when we add features or when the law changes. We
            update the effective date at the top, and for important changes we tell you in the app
            or by email before they take effect. If you don&apos;t agree with a change, you can
            delete your account before it applies.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Email{' '}
            <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
              {SUPPORT_EMAIL}
            </a>
            , use the <em>Send feedback</em> button inside the app (a person reads every note), or
            see{' '}
            <Link href="/support" className={linkClass}>
              Help &amp; support
            </Link>
            .
          </p>
        </Section>
      </div>

      <p className="mt-10 text-sm">
        <Link href="/" className={linkClass}>
          ← Back to Chefer
        </Link>{' '}
        ·{' '}
        <Link href="/privacy" className={linkClass}>
          Privacy Policy
        </Link>{' '}
        ·{' '}
        <Link href="/support" className={linkClass}>
          Support
        </Link>
      </p>
    </main>
  );
}
