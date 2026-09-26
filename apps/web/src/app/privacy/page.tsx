import type { Metadata } from 'next';
import Link from 'next/link';
import { fetchAiProviderDisclosure } from '@/lib/ai-providers';
import { AI_PROVIDERS, SUPPORT_EMAIL } from '@chefer/types';
import { formatAiProviderNames } from '@chefer/utils';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'What data Chefer collects, why, who processes it, how long we keep it and your rights.',
};

// GDPR Art. 13 privacy notice, in plain language (backlog P0-6, 2026-09-26).
// Linked from register/login, the landing footer, /support, web Profile and the
// mobile register + More screens.
//
// MAINTAINERS: this text was drafted without a lawyer. Have it reviewed by a
// lawyer qualified in Romanian/EU data-protection law before any paid launch.
// Keep it true to the code: when a processor, retention period or data flow
// changes, update this page in the same PR (the processor evidence is listed
// in infrastructure.md §15, "Privacy & analytics consent"). Bump
// EFFECTIVE_DATE on every material change.

const EFFECTIVE_DATE = '26 September 2026';

const linkClass = 'touch-target relative text-[#944a00] underline underline-offset-4';

function Section({
  id,
  title,
  children,
}: {
  id?: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-6 space-y-2">
      <h2 className="font-semibold text-gray-900">{title}</h2>
      {children}
    </section>
  );
}

function Mail() {
  return (
    <a href={`mailto:${SUPPORT_EMAIL}`} className={`${linkClass} break-all`}>
      {SUPPORT_EMAIL}
    </a>
  );
}

export default async function PrivacyPage() {
  // The AI recipients come from the live API config (profile.aiProviders), so
  // this page names exactly who receives data — Gemini, or in free-only mode
  // Groq and Cloudflare Workers AI.
  const ai = await fetchAiProviderDisclosure();
  const primary = AI_PROVIDERS[ai.primary];
  const backups = ai.backups.filter((id) => id !== ai.primary);
  return (
    <main id="main" className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="font-serif text-3xl font-semibold text-gray-900">Privacy Policy</h1>
      <p className="mt-2 text-sm font-medium text-gray-700">Effective {EFFECTIVE_DATE}</p>

      <div className="mt-8 space-y-8 text-sm leading-relaxed text-gray-700">
        <Section title="The short version">
          <ul className="list-disc space-y-1 pl-5">
            <li>We use your data to run Chefer: your plans, recipes, logs and workouts.</li>
            <li>We never sell your data, and we show no ads.</li>
            <li>AI features send your data to an AI provider only after you allow it.</li>
            <li>
              Usage analytics use no cookies, and are linked to your account only if you opt in.
            </li>
            <li>You can download your data or delete your account yourself, at any time.</li>
          </ul>
        </Section>

        <Section title="Who we are">
          <p>
            Chefer is run by Pop Dan-Vlad, an individual based in Romania, who is the data
            controller for the personal data described here. In this policy, &ldquo;we&rdquo; and
            &ldquo;us&rdquo; mean him. For anything about your data, email <Mail />. Chefer has no
            data protection officer, so write to the same address.
          </p>
        </Section>

        <Section title="What we collect and why">
          <p>For each kind of data: what it is, what we use it for, and the legal basis.</p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Your account</strong>: name, email address and password (stored only as a
              secure hash). Used to sign you in, to send account emails (confirming your address,
              resetting your password) and to keep your account safe. Basis: our contract with you.
            </li>
            <li>
              <strong>What you put into the app</strong>: dietary preferences, disliked ingredients,
              goals, meal plans, recipes and the photos you add, shopping lists, pantry items, food
              logs, household members, units and an optional delivery address. Used to provide the
              features you ask for. Basis: our contract with you.
            </li>
            <li>
              <strong>Health-related data</strong>: see the next section.
            </li>
            <li>
              <strong>Weekly emails</strong>: a Monday &ldquo;your week is ready&rdquo; email and a
              Sunday recap, sent to your confirmed address. Basis: our legitimate interest in
              helping you use the plan you made. You can switch each one off in Preferences or with
              the unsubscribe link in the email.
            </li>
            <li>
              <strong>Feedback</strong> you send with <em>Send feedback</em>, together with the page
              you were on. Used to fix and improve Chefer. Basis: legitimate interest.
            </li>
            <li>
              <strong>Security and error data</strong>: IP address, browser or device type, and
              technical details of requests and errors. Used to keep Chefer running, to stop abuse
              (for example with limits on sign-in attempts) and to fix crashes. Basis: our
              legitimate interest in a secure, working service.
            </li>
            <li>
              <strong>Usage analytics</strong>: which pages and features are used. Basis: legitimate
              interest for anonymous counts, and your consent for analytics linked to your account.
              See{' '}
              <a href="#analytics" className={linkClass}>
                Cookies and analytics
              </a>
              .
            </li>
          </ul>
          <p>
            To create an account we need your name, email and a password. Everything else is up to
            you, but some features cannot work without it: calorie targets, for example, need your
            body metrics.
          </p>
        </Section>

        <Section title="Health-related data">
          <p>
            Some of what you can enter says something about your health: body metrics (age, sex,
            height, weight and weight history), goals and calorie targets, allergies and dietary
            restrictions, the meals you log, and your workouts, training history and training
            breaks. Details about the household members you add, such as their allergies, can be
            health-related too.
          </p>
          <p>
            Under the GDPR this can be special-category data (Art. 9), so we process it only with
            your explicit consent. All of it is optional. You give that consent when you choose to
            enter it, and you can withdraw it at any time by deleting the entries or your whole
            account. Withdrawing does not affect what we did with the data before. We use it only to
            run the features you use, such as working out your targets, filtering recipes and
            planning your training. We never use it for advertising.
          </p>
          <p>When you add a household member, only add details they are happy for you to share.</p>
        </Section>

        <Section title="AI processing">
          <p>
            Plan generation, meal swaps, meal-photo scanning, recipe import, chat and AI
            shopping-list tidy-up send the relevant data (your preferences and allergies, goals and
            body metrics, the photo, recipe or message you submitted) to an AI provider — currently{' '}
            {primary.name}
            {backups.length > 0 && (
              <>
                ; if {primary.shortName} is busy, a request may be handled by our backup AI provider
                {backups.length > 1 ? 's' : ''}, {formatAiProviderNames(backups)}
              </>
            )}{' '}
            — to produce the result. We do not use your data to train models. Photos you scan or
            import are sent to the AI provider to be read; we do not store them. When you import a
            video link that has no caption or subtitles, its audio is transcribed by Groq and
            deleted right after.
          </p>
          <p>
            We ask for your permission before the first AI feature sends anything, and tell you what
            that feature sends. If you choose <em>Not now</em>, nothing is sent. You can withdraw
            permission at any time in <em>Profile → AI &amp; your data</em>, on the web or in the
            app; we then ask again before the next AI feature runs. The weekly plan and weekly
            review we prepare for you automatically follow the same choice: without your permission,
            nothing is sent to the AI provider for them. Basis: your consent (explicit consent for
            any health-related data included).
          </p>
          <p>
            AI output and the targets Chefer calculates are automated suggestions. They do not lead
            to decisions with legal or similarly significant effects on you, and you can always
            change or ignore them.
          </p>
        </Section>

        <Section title="Camera & photos">
          <p>
            The iOS and Android app use your camera or photo library only when you choose to take or
            attach a photo — for example to scan a meal or add a recipe photo. Nothing is read in
            the background. Photos you attach to a recipe or an ingredient are stored on our server
            so you can see them.
          </p>
        </Section>

        <Section title="Who receives your data">
          <p>
            We share data only with the service providers below. They process it for us under
            contract, and each gets only what it needs.
          </p>
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Oracle Cloud Infrastructure</strong> hosts our servers and database in
              Frankfurt, Germany (EU).
            </li>
            <li>
              <strong>{primary.privacyName}</strong> runs the AI features, only with your permission
              (see above). {primary.privacyDetail}
            </li>
            {backups.map((id) => (
              <li key={id}>
                <strong>{AI_PROVIDERS[id].privacyName}</strong> is a backup AI provider, with the
                same permission. {AI_PROVIDERS[id].privacyDetail}
              </li>
            ))}
            {ai.primary !== 'groq' && !backups.includes('groq') && (
              <li>
                <strong>Groq</strong> transcribes the audio of a video link you import, with the
                same permission. {AI_PROVIDERS.groq.privacyDetail}
              </li>
            )}
            <li>
              <strong>Sentry</strong> receives error reports and performance data from the website
              and our server. These can include your IP address, browser type and the page involved.
              The data is stored in Sentry&apos;s EU region (Germany); Sentry is a US company.
            </li>
            <li>
              <strong>PostHog</strong> provides usage analytics for the website, stored in
              PostHog&apos;s EU cloud; PostHog is a US company. See{' '}
              <a href="#analytics" className={linkClass}>
                Cookies and analytics
              </a>
              .
            </li>
            <li>
              <strong>Our email provider</strong> delivers account emails and weekly emails, so it
              receives your email address and the content of those emails. It may process data
              outside the EU.
            </li>
            <li>
              <strong>Expo</strong> delivers updates to the iOS and Android app. When the app checks
              for an update, Expo sees your IP address and technical details of the app and device,
              but no account data. United States.
            </li>
          </ul>
          <p>
            Recipe pictures are made by an image-generation service (currently Pollinations) from
            the recipe&apos;s name and cuisine only, and supermarket prices are looked up by
            ingredient name only. Neither receives anything about you.
          </p>
          <p>
            Some pictures and videos in Chefer load from other hosts: recipe images (Unsplash,
            Pollinations) and exercise video thumbnails and videos (YouTube, in its privacy-enhanced
            mode). Your browser or app then contacts that host directly, which shows it your IP
            address, as with any website.
          </p>
          <p>
            If you download the app, Apple (App Store) or Google (Google Play) handle the download
            under their own privacy policies. We may also disclose data where the law requires it,
            for example to a court or an authority.
          </p>
        </Section>

        <Section title="Transfers outside the EU">
          <p>
            Our servers and database are in the EU. Some of the providers above are based in the
            United States or other countries outside the European Economic Area, or may access data
            from there. When that happens we rely on the safeguards the GDPR provides: the European
            Commission&apos;s adequacy decision for the EU-US Data Privacy Framework, where the
            provider is certified under it, or the Commission&apos;s Standard Contractual Clauses.
            Email us for more information about these safeguards.
          </p>
        </Section>

        <Section title="How long we keep your data">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong>Your account and everything in it</strong>: as long as you have an account.
              When you delete it, it is removed from the live database straight away (see below).
            </li>
            <li>
              <strong>Backups</strong>: the database is backed up daily. The server keeps the last
              14 daily backups, and a second copy of the last 30 is kept on the operator&apos;s own
              computer in case the server fails. Deleted data therefore disappears from all backups
              within about 30 days. Backups are used only to restore the service after a failure.
            </li>
            <li>
              <strong>Sign-in sessions</strong> expire after 30 days. Password-reset links expire
              after 1 hour.
            </li>
            <li>
              <strong>Server logs, error reports and analytics</strong> are kept only as long as
              needed for security, fixing problems and understanding usage. They are then deleted
              automatically under the retention settings of our server, Sentry and PostHog.
            </li>
          </ul>
        </Section>

        <Section title="Deleting your account">
          <p>
            You can delete your account yourself at any time: <em>Profile → Delete account</em>, on
            the web or in the iOS and Android app (you confirm with your password). This removes
            your account and everything in it — preferences, plans, logs, recipes, uploaded photos,
            workouts, household and feedback — from the live database immediately, and signs you out
            on every device. Recipes that Chefer&apos;s AI generated for you contain no personal
            data; they may stay in the shared recipe collection with no link to you. You can
            download all your data first from <em>Profile → Your data</em>.
          </p>
        </Section>

        <Section title="Your rights">
          <p>Under the GDPR you have the right to:</p>
          <ul className="list-disc space-y-1 pl-5">
            <li>access your data and get a copy (Profile → Your data, or email us);</li>
            <li>have wrong data corrected (you can edit most of it in the app);</li>
            <li>have your data erased (Profile → Delete account, or email us);</li>
            <li>get your data in a portable, machine-readable format (the download is JSON);</li>
            <li>restrict how we use your data in some cases;</li>
            <li>
              object to processing based on legitimate interest, such as weekly emails or anonymous
              analytics;
            </li>
            <li>
              withdraw any consent at any time: AI in Profile → AI &amp; your data, analytics in
              Profile → Usage analytics, health data by deleting it. This does not affect what we
              did before.
            </li>
          </ul>
          <p>
            To use a right, email <Mail /> from the address on your account. We reply within one
            month. You can also complain to a data protection authority. In Romania that is ANSPDCP
            (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal),{' '}
            <a
              href="https://www.dataprotection.ro"
              className={linkClass}
              target="_blank"
              rel="noopener noreferrer"
            >
              dataprotection.ro
            </a>
            . You can also go to the authority in the country where you live or work.
          </p>
        </Section>

        <Section title="Children">
          <p>
            Chefer is for people aged 16 and over, the age of digital consent in Romania. We do not
            knowingly collect data from anyone younger. If you think a child under 16 has an
            account, email us and we will delete it.
          </p>
        </Section>

        <Section id="analytics" title="Cookies and analytics">
          <p>
            <strong>Cookies.</strong> The website sets only the cookies it needs to work: your
            sign-in session, and one that remembers whether you last used Food or Gym mode. We use
            no advertising or cross-site tracking cookies. The website also keeps a few of your own
            settings in your browser&apos;s storage (for example your notes on an exercise, or your
            analytics choice). They stay on your device.
          </p>
          <p>
            <strong>Analytics.</strong> The website uses PostHog, hosted in the EU, to count which
            pages and features are used. It stores nothing on your device: no cookies and no local
            storage. When you are signed out, or signed in without opting in, the events are
            anonymous and not linked to you or your account. If you turn on{' '}
            <em>Profile → Usage analytics</em>, events are linked to your account ID and plan (never
            your name or email) so we can see how Chefer is used over time. You can turn it off
            again at any time. The choice applies to the browser you set it in. If your browser
            sends a &ldquo;Do Not Track&rdquo; signal, we send no analytics at all.
          </p>
          <p>
            <strong>In the app.</strong> The iOS and Android app sends no analytics and shows no
            ads. It keeps your sign-in in the device&apos;s secure storage and saves workouts on the
            device until they sync. Reminders are scheduled on your device.
          </p>
        </Section>

        <Section title="Security">
          <p>
            All traffic to Chefer is encrypted (HTTPS), passwords are stored only as secure hashes,
            and access to the servers is restricted. No system is perfectly secure. If a breach puts
            your data at risk, we will tell you and the authorities as the law requires.
          </p>
        </Section>

        <Section title="Changes to this policy">
          <p>
            When we change this policy, we update the effective date at the top. For important
            changes, such as a new use of your data or a new kind of provider, we tell you in the
            app or by email before they take effect, and ask for your consent again where the law
            requires it.
          </p>
        </Section>

        <Section title="Contact">
          <p>
            Questions about your data or this policy? Email <Mail /> or see{' '}
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
        <Link href="/terms" className={linkClass}>
          Terms of Service
        </Link>{' '}
        ·{' '}
        <Link href="/support" className={linkClass}>
          Support
        </Link>
      </p>
    </main>
  );
}
