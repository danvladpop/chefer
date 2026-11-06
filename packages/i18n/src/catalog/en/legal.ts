// Lane J phase 2, group A. The public legal pages (Terms, Privacy, Support),
// the web error and 404 pages, and the in-app legal screen. Keep English
// byte-identical to what shipped.
//
// Markup inside a message: `<em>…</em>` and `<strong>…</strong>` (web pages
// only), and `{token}` placeholders for links, filled by `rich()`.
export const legal = {
  common: {
    effective: 'Effective {date}',
    privacyPolicy: 'Privacy Policy',
    termsOfService: 'Terms of Service',
    helpAndSupport: 'Help & support',
    support: 'Support',
    backToChefer: '← Back to Chefer',
  },
  terms: {
    metaTitle: 'Terms of Service',
    metaDescription: 'The rules for using Chefer, including health, allergen and AI disclaimers.',
    title: 'Terms of Service',
    effectiveDate: '26 September 2026',
    short: {
      title: 'The short version',
      i1: 'Chefer helps you plan meals, shop, track food and train. You must be 16 or over.',
      i2: 'It is not medical advice. Targets are estimates, and allergen checks can miss things.',
      i3: 'AI can be wrong. Check what it gives you.',
      i4: 'Premium is included at no cost, and Chefer never takes payment details.',
      i5: 'You can delete your account at any time.',
    },
    who: {
      title: 'Who we are',
      p1: 'Chefer is run by Pop Dan-Vlad, an individual based in Romania (“we”, “us”). These terms are the agreement between you and us when you use the Chefer website or the Chefer app. On the App Store, the iOS app is published by Smooth Path Digital S.R.L on our behalf, which is why Apple shows that company as the seller; Smooth Path Digital S.R.L does not receive or process your Chefer account data. Our {privacy} explains how we handle your data.',
    },
    age: {
      title: 'Who can use Chefer',
      p1: 'You must be at least 16 years old to create an account. By creating one, you confirm that you are.',
    },
    account: {
      title: 'Your account',
      p1: 'Give us a real email address and keep your password to yourself. You are responsible for what happens in your account. If you think someone else has access to it, change your password and tell us. One account is for one person; household members you add are profiles inside your account, not separate accounts.',
    },
    fair: {
      title: 'Using Chefer fairly',
      intro: "Please don't:",
      i1: 'break the law, or upload content you have no right to share;',
      i2: 'upload anything harmful, hateful or sexually explicit;',
      i3: 'try to break, overload or get around the limits of the service, including scraping it, automated access, or probing it for security holes without our permission;',
      i4: 'use Chefer to build a competing service or resell it;',
      i5: "use another person's account or pretend to be someone else.",
      outro:
        'Found a security problem? Please email us rather than testing it further. We are glad to hear about it.',
    },
    content: {
      title: 'Your content',
      p1: 'Recipes, photos, notes and other content you add stay yours. Recipes you import or create stay in your personal collection and are not shared with other users. To run Chefer, you give us a free, non-exclusive licence to store, copy, process and display your content, only to provide the service to you: for example to show it on your devices, scale your recipes or send it to the AI provider when you use an AI feature. The licence ends when you delete the content or your account, apart from backup copies, which expire as the Privacy Policy describes.',
      p2: 'Only import recipes and photos you are allowed to use. Imported recipes are for your personal use.',
    },
    health: {
      title: 'Health and nutrition: not medical advice',
      p1: 'Chefer gives general information about food and training. It is not medical, dietetic or other professional advice, and it does not replace a doctor, dietitian or qualified trainer.',
      i1: 'Calorie, protein and other targets, and the nutrition figures for recipes and logged meals, are estimates calculated from general formulas and data. They can be wrong for you.',
      i2: 'Talk to a doctor or registered dietitian before you change your diet if you are pregnant or breastfeeding, under 18, have a medical condition, take medication, or have (or have had) an eating disorder.',
      i3: 'Exercise carries a risk of injury. Training suggestions are general. Warm up, use a weight you can control, stop if something hurts, and check with a doctor before you start if you have any health concerns.',
    },
    allergies: {
      title: 'Allergies: always check yourself',
      p1: "We filter recipes against the allergies and restrictions you declare, and we take that seriously. But automated checks are best effort. Ingredient names can be ambiguous, products vary, labels change, and the AI can make mistakes. Always read ingredient lists and product labels before you buy, cook or eat. If you or someone you cook for has a severe allergy, don't rely on Chefer alone: check every ingredient yourself.",
    },
    ai: {
      title: 'AI features',
      p1: 'Some features use AI to write plans, recipes, answers and nutrition estimates, or to read photos. AI output can be wrong, incomplete or out of date, even when it sounds sure. Treat it as a suggestion and use your own judgement, especially about allergies, food safety and cooking temperatures. AI features send your data to an AI provider only with your permission (see the Privacy Policy).',
    },
    plans: {
      title: 'Free and Premium',
      p1: 'Chefer has a free tier and a Premium tier with more features and higher daily limits. Premium is included at no cost, and Chefer never takes payment details. If paid plans are ever introduced, we will tell you in advance, inside the app, with the price and terms before you decide. Nothing will be charged automatically, and you will not be moved to a paid plan without agreeing to it. Daily limits on features may change.',
    },
    availability: {
      title: 'Availability and changes',
      p1: 'Chefer is a small independent project that keeps changing. We work to keep it running and your data safe, and we keep daily backups, but we cannot promise it will always be available or free of errors. We may add, change or remove features. If a change removes something important to you, we will tell you in advance where we reasonably can.',
    },
    ending: {
      title: 'Ending your account',
      p1: 'You can stop using Chefer and delete your account at any time from <em>Profile → Delete account</em>, on the web or in the app. You can download your data first from <em>Profile → Your data</em>.',
      p2: "We may suspend or close an account that seriously or repeatedly breaks these terms, or where the law requires it. Unless it would be unlawful or put others at risk, we will tell you why first and give you a chance to download your data. If we ever shut Chefer down, we will give you at least 30 days' notice.",
    },
    responsibility: {
      title: 'Our responsibility',
      p1: 'We provide Chefer with reasonable care and skill. Beyond that, and to the extent the law allows, we give no promise that it will meet your particular needs.',
      p2: 'We are not responsible for losses that we could not reasonably foresee, that were caused by your own choices (such as not checking a label or ignoring a medical warning), or that are caused by events outside our control.',
      p3: 'Nothing in these terms limits or excludes our liability for death or personal injury caused by our negligence, for fraud, for harm we cause intentionally or through gross negligence, or any other liability that cannot be limited under applicable law. Nothing in these terms affects your statutory rights as a consumer.',
    },
    law: {
      title: 'Law and disputes',
      p1: 'These terms are governed by Romanian law. If you are a consumer living in the EU, you also keep the protection of the mandatory rules of the country where you live, and you can bring a claim in the courts of that country as well as in Romania. If something goes wrong, please email us first. Most problems can be fixed quickly.',
    },
    changes: {
      title: 'Changes to these terms',
      p1: "We may update these terms, for example when we add features or when the law changes. We update the effective date at the top, and for important changes we tell you in the app or by email before they take effect. If you don't agree with a change, you can delete your account before it applies.",
    },
    contact: {
      title: 'Contact',
      p1: 'Email {email}, use the <em>Send feedback</em> button inside the app (a person reads every note), or see {support}.',
    },
  },
  privacy: {
    metaTitle: 'Privacy Policy',
    metaDescription:
      'What data Chefer collects, why, who processes it, how long we keep it and your rights.',
    title: 'Privacy Policy',
    effectiveDate: '30 September 2026',
    short: {
      title: 'The short version',
      i1: 'We use your data to run Chefer: your plans, recipes, logs and workouts.',
      i2: 'We never sell your data, and we show no ads.',
      i3: 'AI features send your data to an AI provider only after you allow it.',
      i4: 'Usage analytics use no cookies, and are linked to your account only if you opt in.',
      i5: 'You can download your data or delete your account yourself, at any time.',
    },
    who: {
      title: 'Who we are',
      p1: 'Chefer is run by Pop Dan-Vlad, an individual based in Romania, who is the data controller for the personal data described here. In this policy, “we” and “us” mean him. On the App Store, the iOS app is published by Smooth Path Digital S.R.L on his behalf, which is why Apple shows that company as the seller. Smooth Path Digital S.R.L does not receive or process your Chefer account data. For anything about your data, email {email}. Chefer has no data protection officer, so write to the same address.',
    },
    collect: {
      title: 'What we collect and why',
      intro: 'For each kind of data: what it is, what we use it for, and the legal basis.',
      i1: '<strong>Your account</strong>: name, email address and password (stored only as a secure hash). Used to sign you in, to send account emails (confirming your address, resetting your password) and to keep your account safe. Basis: our contract with you.',
      i2: '<strong>What you put into the app</strong>: dietary preferences, disliked ingredients, goals, meal plans, recipes and the photos you add, shopping lists, pantry items, food logs, household members, units and an optional delivery address. Used to provide the features you ask for. Basis: our contract with you.',
      i3: '<strong>Health-related data</strong>: see the next section.',
      i4: '<strong>Weekly emails</strong>: a Monday “your week is ready” email and a Sunday recap, sent to your confirmed address. Basis: our legitimate interest in helping you use the plan you made. You can switch each one off in Preferences or with the unsubscribe link in the email.',
      i5: '<strong>Feedback</strong> you send with <em>Send feedback</em>, together with the page you were on. Used to fix and improve Chefer. Basis: legitimate interest.',
      i6: '<strong>Security and error data</strong>: IP address, browser or device type, and technical details of requests and errors. Used to keep Chefer running, to stop abuse (for example with limits on sign-in attempts) and to fix crashes. Basis: our legitimate interest in a secure, working service.',
      i7: '<strong>Usage analytics</strong>: which pages and features are used. Basis: legitimate interest for anonymous counts, and your consent for analytics linked to your account. See {analytics}.',
      analyticsLink: 'Cookies and analytics',
      outro:
        'To create an account we need your name, email and a password. Everything else is up to you, but some features cannot work without it: calorie targets, for example, need your body metrics.',
    },
    health: {
      title: 'Health-related data',
      p1: 'Some of what you can enter says something about your health: body metrics (age, sex, height, weight and weight history), goals and calorie targets, allergies and dietary restrictions, the meals you log, and your workouts, training history and training breaks. Details about the household members you add, such as their allergies, can be health-related too.',
      p2: "Under the GDPR this can be special-category data (Art. 9), so we process it only with your explicit consent. All of it is optional. The website and the app ask for that consent before the first time you save any of it, in a sheet that is separate from the AI permission below. If you choose <em>Don't save it</em>, none of it is stored. You can withdraw the consent at any time: on the website in <em>Profile → Health information</em>, in the app in <em>Profile → Privacy & data → Health information</em>, using <em>Withdraw and delete</em>. That deletes the allergies, diets, dislikes, goal, measurements and weigh-ins stored for you and your household. You can also delete individual entries or your whole account. Withdrawing does not affect what we did with the data before. If you already had an account before this consent existed, we keep what you entered and ask you the next time you open the app or website. We use the data only to run the features you use, such as working out your targets, filtering recipes and planning your training. We never use it for advertising.",
      p3: 'When you add a household member, only add details they are happy for you to share.',
    },
    ai: {
      title: 'AI processing',
      p1: "Plan generation, meal swaps, meal-photo scanning, recipe import, chat, AI shopping-list tidy-up, the weekly review and filling in an ingredient's nutrition send the relevant data (your preferences and allergies, goals, body metrics and weight trend, the photo, recipe, message or ingredient name you submitted) to an AI provider — currently {primary}{backup} — to produce the result. We do not use your data to train models. Photos you scan or import are sent to the AI provider to be read; we do not store them. When you import a video link that has no caption or subtitles, its audio is transcribed by Groq and deleted right after.",
      backup: {
        one: '; if {primaryShort} is busy, a request may be handled by our backup AI provider, {backups}',
        other:
          '; if {primaryShort} is busy, a request may be handled by our backup AI providers, {backups}',
      },
      p2: 'We ask for your permission before the first AI feature sends anything, and tell you what that feature sends. If you choose <em>Not now</em>, nothing is sent. You can withdraw permission at any time in <em>Profile → AI & your data</em>, on the web or in the app; we then ask again before the next AI feature runs. The weekly plan and weekly review we prepare for you automatically follow the same choice: without your permission, nothing is sent to the AI provider for them. Basis: your consent (explicit consent for any health-related data included).',
      p3: 'AI output and the targets Chefer calculates are automated suggestions. They do not lead to decisions with legal or similarly significant effects on you, and you can always change or ignore them.',
    },
    camera: {
      title: 'Camera & photos',
      p1: 'The Chefer app uses your camera or photo library only when you choose to take or attach a photo — for example to scan a meal or add a recipe photo. Nothing is read in the background. Photos you attach to a recipe or an ingredient are stored on our server so you can see them.',
    },
    recipients: {
      title: 'Who receives your data',
      intro:
        'We share data only with the service providers below. They process it for us under contract, and each gets only what it needs.',
      oracle:
        '<strong>Oracle Cloud Infrastructure</strong> hosts our servers and database in Frankfurt, Germany (EU).',
      aiPrimary:
        '<strong>{name}</strong> runs the AI features, only with your permission (see above). {detail}',
      aiBackup:
        '<strong>{name}</strong> is a backup AI provider, with the same permission. {detail}',
      aiGroq:
        '<strong>Groq</strong> transcribes the audio of a video link you import, with the same permission. {detail}',
      sentry:
        "<strong>Sentry</strong> receives error reports and performance data from the website and our server. These can include your IP address, browser type and the page involved. It also receives crash reports from the Chefer app: what went wrong, the app version, and the phone model and operating system, tagged with your account ID (not your name or email). The data is stored in Sentry's EU region (Germany); Sentry is a US company.",
      posthog:
        "<strong>PostHog</strong> provides usage analytics for the website and, in app versions that have analytics switched on, for the app, stored in PostHog's EU cloud; PostHog is a US company. See {analytics}.",
      email:
        '<strong>Our email provider</strong> delivers account emails and weekly emails, so it receives your email address and the content of those emails. It may process data outside the EU.',
      expo: '<strong>Expo</strong> delivers updates to the Chefer app. When the app checks for an update, Expo sees your IP address and technical details of the app and device, but no account data. United States.',
      images:
        "Recipe pictures are made by an image-generation service (currently Pollinations) from the recipe's name and cuisine only, and supermarket prices are looked up by ingredient name only. Neither receives anything about you.",
      hosts:
        'Some pictures and videos in Chefer load from other hosts: recipe images (Unsplash, Pollinations) and exercise video thumbnails and videos (YouTube, in its privacy-enhanced mode). Your browser or app then contacts that host directly, which shows it your IP address, as with any website.',
      stores:
        'If you download the app, Apple (App Store) or Google (Google Play) handle the download under their own privacy policies. We may also disclose data where the law requires it, for example to a court or an authority.',
      detail: {
        gemini: 'It may process data in the United States and other countries.',
        groq: 'United States. Under its services agreement Groq does not use what we send to train models.',
        cloudflare:
          'Cloudflare is a US company and runs the models on its global network, so a request may be processed outside the EU. Cloudflare does not use what we send to train models.',
      },
    },
    transfers: {
      title: 'Transfers outside the EU',
      p1: "Our servers and database are in the EU. Some of the providers above are based in the United States or other countries outside the European Economic Area, or may access data from there. When that happens we rely on the safeguards the GDPR provides: the European Commission's adequacy decision for the EU-US Data Privacy Framework, where the provider is certified under it, or the Commission's Standard Contractual Clauses. Email us for more information about these safeguards.",
    },
    retention: {
      title: 'How long we keep your data',
      i1: '<strong>Your account and everything in it</strong>: as long as you have an account. When you delete it, it is removed from the live database straight away (see below).',
      i2: "<strong>Backups</strong>: the database is backed up daily. The server keeps the last 14 daily backups, and a second copy of the last 30 is kept on the operator's own computer in case the server fails. Deleted data therefore disappears from all backups within about 30 days. Backups are used only to restore the service after a failure.",
      i3: '<strong>Sign-in sessions</strong> expire after 30 days. Password-reset links expire after 1 hour.',
      i4: '<strong>Server logs, error reports and analytics</strong> are kept only as long as needed for security, fixing problems and understanding usage. They are then deleted automatically under the retention settings of our server, Sentry and PostHog.',
    },
    deletion: {
      title: 'Deleting your account',
      p1: "You can delete your account yourself at any time: <em>Profile → Delete account</em>, on the web or in the app (you confirm with your password). This removes your account and everything in it — preferences, plans, logs, recipes, uploaded photos, workouts, household and feedback — from the live database immediately, and signs you out on every device. Recipes that Chefer's AI generated for you contain no personal data; they may stay in the shared recipe collection with no link to you. You can download all your data first from <em>Profile → Your data</em>.",
    },
    rights: {
      title: 'Your rights',
      intro: 'Under the GDPR you have the right to:',
      i1: 'access your data and get a copy (Profile → Your data, or email us);',
      i2: 'have wrong data corrected (you can edit most of it in the app);',
      i3: 'have your data erased (Profile → Delete account, or email us);',
      i4: 'get your data in a portable, machine-readable format (the download is a JSON file with your account, plans, recipes, logs, workouts, consent history and a log of the AI requests made for you; your workouts can also be exported as a CSV from the Gym settings);',
      i5: 'restrict how we use your data in some cases;',
      i6: 'object to processing based on legitimate interest, such as weekly emails or anonymous analytics;',
      i7: 'withdraw any consent at any time: AI in Profile → AI & your data, analytics in Profile → Usage analytics, health information in Profile → Health information (Withdraw and delete). This does not affect what we did before.',
      p1: 'To use a right, email {email} from the address on your account. We reply within one month. You can also complain to a data protection authority. In Romania that is ANSPDCP (Autoritatea Națională de Supraveghere a Prelucrării Datelor cu Caracter Personal), {anspdcp}. You can also go to the authority in the country where you live or work.',
    },
    children: {
      title: 'Children',
      p1: 'Chefer is for people aged 16 and over, the age of digital consent in Romania. We do not knowingly collect data from anyone younger. If you think a child under 16 has an account, email us and we will delete it.',
    },
    analytics: {
      title: 'Cookies and analytics',
      p1: "<strong>Cookies.</strong> The website sets only the cookies it needs to work: your sign-in session, and one that remembers whether you last used Food or Gym mode. We use no advertising or cross-site tracking cookies. The website also keeps a few of your own settings in your browser's storage (for example your notes on an exercise, or your analytics choice). They stay on your device.",
      p2: '<strong>Analytics.</strong> The website uses PostHog, hosted in the EU, to count which pages and features are used. It stores nothing on your device: no cookies and no local storage. When you are signed out, or signed in without opting in, the events are anonymous and not linked to you or your account. If you turn on <em>Profile → Usage analytics</em>, events are linked to your account ID and plan (never your name or email) so we can see how Chefer is used over time. You can turn it off again at any time. The choice applies to the browser you set it in. If your browser sends a “Do Not Track” signal, we send no analytics at all.',
      p3: "<strong>In the app.</strong> The Chefer app shows no ads and uses no advertising identifier. It can send the same kind of anonymous usage counts to PostHog (EU) as the website, but only in app versions that have analytics switched on; where they do, <em>Profile → Privacy & data → Usage analytics</em> has two switches. “Send anonymous usage counts” is on by default and sends counts of which screens and features are used, tagged with a random identifier made each time the app starts and never stored, with no name, email or health information. “Link usage to my account” is off unless you turn it on; when it is on, the counts can carry your account ID instead (never your name or email). Turning the first switch off stops all analytics requests from the app at once. The choice applies to the phone you set it on. The app keeps your sign-in in the device's secure storage and saves workouts on the device until they sync. Reminders are scheduled on your device.",
    },
    security: {
      title: 'Security',
      p1: 'All traffic to Chefer is encrypted (HTTPS), passwords are stored only as secure hashes, and access to the servers is restricted. No system is perfectly secure. If a breach puts your data at risk, we will tell you and the authorities as the law requires.',
    },
    changes: {
      title: 'Changes to this policy',
      p1: 'When we change this policy, we update the effective date at the top. For important changes, such as a new use of your data or a new kind of provider, we tell you in the app or by email before they take effect, and ask for your consent again where the law requires it.',
    },
    contact: {
      title: 'Contact',
      p1: 'Questions about your data or this policy? Email {email} or see {support}.',
    },
  },
  support: {
    metaTitle: 'Help & Support',
    metaDescription:
      'How to get help with Chefer: contact, password reset, account deletion and AI.',
    title: 'Help & Support',
    updated: 'Chefer · last updated 26 September 2026',
    what: {
      title: 'What Chefer is',
      p1: 'Chefer plans a week of meals around your goals and allergies, prices the shopping list, tracks what you eat and plans your gym training. It runs on the web and in the Chefer app, with one account for both.',
    },
    app: {
      title: 'Get the app',
      p1: 'Sign in with the same account you use on the web.',
    },
    help: {
      title: 'Get help',
      i1: 'In the app: <em>Send feedback</em> (in the menu on the web, under <em>More</em> in the app). A person reads every note.',
      i2: 'By email: {email}. Include the email address you signed up with so we can find your account.',
    },
    faq: {
      title: 'Frequently asked questions',
      resetQ: 'How do I reset my password?',
      resetA:
        'On the sign-in screen, tap <em>Forgot password?</em> and enter your email. We send a link that lets you choose a new password; it expires after a short while, so use it soon. No email? Check your spam folder, or write to us.',
      deleteQ: 'How do I delete my account?',
      deleteA:
        "Go to <em>Profile → Delete account</em>, on the web or in the app. Confirm with your password and type DELETE. Your account and all of its data — preferences, plans, logs, recipes, workouts and household — are removed straight away and you are signed out on every device. This can't be undone. Want a copy first? Use <em>Profile → Your data → Download my data</em>. See the {privacy} for how long backups keep a copy.",
      deletePrivacyLink: 'privacy policy',
      aiQ: 'How does Chefer use AI?',
      aiA: 'Premium meal plans and swaps, meal-photo scanning, recipe import, the AI chef chat and the AI shopping-list tidy-up send the data each one needs (for example your preferences and allergies, goals and body metrics, or the photo or message you submitted) to {providers} to produce the result. We ask for your permission before the first one runs, and you can turn it off at any time in <em>Profile → AI & your data</em>. Your data is not used to train AI models. AI output can be wrong — always check ingredients against your allergies.',
      premiumQ: 'Is Premium free?',
      premiumA:
        'Yes. Every Premium feature is free to use, and Chefer never takes payment details.',
    },
  },
  providers: {
    listJoin: '{head} and {last}',
  },
  appErrors: {
    webTitle: 'Something went wrong',
    webBody:
      'We encountered an unexpected error. Please try again, and if the problem persists, contact support.',
    errorId: 'Error ID: {id}',
    tryAgain: 'Try again',
    goHome: 'Go home',
    notFoundMeta: '404 — Page Not Found',
    notFoundCode: '404 error',
    notFoundTitle: 'Page not found',
    notFoundBody:
      "Sorry, we couldn't find the page you're looking for. It may have been moved, deleted, or never existed.",
    returnHome: 'Return home',
    goToDashboard: 'Go to dashboard',
    appTitle: 'Something went wrong',
    appBody: 'This screen hit an unexpected error. Nothing you saved has been lost.',
    reportSent: 'Thank you. We got your report.',
    reportThis: 'Report this',
    reportLabel: 'Add what you were doing',
    reportFailed: "Couldn't send that. Check your connection and sign-in, then try again.",
    sendReport: 'Send report',
  },
  app: {
    screenTitle: 'Legal',
    notFoundTitle: 'We couldn’t find that page',
    notFoundBody: 'The Terms of Service and the Privacy Policy are the documents that live here.',
    readTerms: 'Read the Terms of Service',
    readPrivacy: 'Read the Privacy Policy',
    loadError: 'Couldn’t load this page. Check your connection and try again.',
  },
} as const;
