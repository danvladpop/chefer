# Store listing in Romanian: draft (Lane J, phase 3)

> **Machine draft.** A native speaker has not reviewed this yet. The owner reviews it before it goes into either store.

This page translates the English App Store listing ([ios/metadata.md](./ios/metadata.md)) into Romanian. It also drafts the
Google Play texts.

- **Claims.** Every claim is the same as in the English listing, and the same evidence table proves it (the "Claims →
  flow" section of `ios/metadata.md`). No Premium, price, trial or "beta" wording, per App Review 3.1.1 and 2.2.
- **Character counts.** The number in brackets after each text is its character count, counted as Unicode code points,
  the way Apple and Google count. Each store's limit is in the section heading.

**When to publish it.** Add the Romanian localization only once the app's main screens are in Romanian (after Lane J
phase 4). Until then a Romanian reader would get a Romanian page and an app that is still mostly English. Phase 1 already
covers emails and the language setting; phase 2 covers sign-in, legal, consent, recipes, cook mode, gym workouts,
Following and settings.

**Terms used.** The rest of the listing follows these:

| English       | Romanian             |
| ------------- | -------------------- |
| meal plan     | plan de mese         |
| shopping list | listă de cumpărături |
| cook mode     | modul de gătit       |
| set / rep     | serie / repetare     |
| rest timer    | cronometru de pauză  |

---

## App Store (App Store Connect → App Information → Localization: Romanian)

### Name (≤ 30)

```
Chefer: Plan de mese și sală
```

[28]. Alternatives if needed: `Chefer: Mese, liste și sală` [27], `Chefer – planificator de mese` [29].

### Subtitle (≤ 30)

```
Mese, cumpărături și antrenament
```

[32]. **Too long by 2.** Use one of these instead:

- `Mesele săptămânii și sala` [25] (preferred)
- `Mese, listă și antrenament` [26]

### Promotional text (≤ 170)

```
Planifică mesele săptămânii ținând cont de alergii, cumpără totul de pe o singură listă, gătește pas cu pas și notează-ți antrenamentele. Chefer îți spune ce să ridici data viitoare și de ce.
```

[191]. **Too long by 21.** Use the shorter version:

```
Mesele săptămânii, după alergiile tale, o singură listă de cumpărături, gătit pas cu pas și antrenamente care îți spun ce să ridici data viitoare.
```

[146]

### Description (≤ 4000)

```
Chefer este un planificator de mese și un jurnal de sală într-o singură aplicație. Îți planifică mesele săptămânii după felul în care mănânci, îți face lista de cumpărături, te ghidează prin fiecare rețetă și îți spune ce să ridici data viitoare.

O SĂPTĂMÂNĂ DE MESE, CU O SINGURĂ ATINGERE
• Planifică săptămâna cu o atingere. Alege ce mese vrei planificate, în ce zile și cât timp ai pentru gătit.
• Alergiile, dietele și ce nu-ți place sunt verificate la fiecare plan, iar fiecare plan arată pentru ce a fost verificat.
• Nu ai poftă de o masă? Înlocuiește-o cu una dintre rețetele tale sau fixează-le pe cele preferate, ca să rămână când planifici din nou.
• Ți-a plăcut o săptămână? Salveaz-o (până la patru săptămâni) și folosește-o din nou.

GĂTEȘTI PENTRU MAI MULȚI
• Adaugă persoanele pentru care gătești, cu alergiile și preferințele lor. Fiecare plan e verificat pentru toți cei de la masă.

O SINGURĂ LISTĂ DE CUMPĂRĂTURI
• Toate ingredientele săptămânii, adunate și grupate pe categorii, cu un cost estimativ.
• Bifează produsele pe măsură ce cumperi și trimite lista cu o atingere.
• Lista rămâne sincronizată între telefon și web.

GĂTEȘTI PAS CU PAS
• Modul de gătit îți arată câte un pas, cu text mare și cronometre, și ține ecranul aprins.
• Adaugă rețetele tale, cu fotografii.

URMĂREȘTI CE MĂNÂNCI
• Azi îți arată cina din seara asta, mesele de mâine și ce trebuie cumpărat.
• Înregistrează o masă din plan cu o atingere, caută un aliment sau adaugă rapid calorii.
• Notează-ți greutatea și urmărește tendința.

ANTRENAMENT ÎN MODUL SALĂ
• Treci de la Mâncare la Sală cu o atingere.
• Răspunde la câteva întrebări și primești o rutină recomandată, pe care o poți modifica oricum.
• Țintele sunt deja completate, așa că o serie se notează cu o atingere. Între serii pornește un cronometru de pauză.
• Progres care se explică singur: după fiecare antrenament, Chefer îți spune ce să ridici data viitoare și de ce.
• Ai puțin timp? Alege 20, 30 sau 45 de minute și primești o variantă mai scurtă a antrenamentului de azi. Ce sari se mută la următorul antrenament.
• Salvează un antrenament pentru mai târziu și termină-l când poți. Ai greșit ceva? Editează sau șterge un antrenament trecut, cu opțiunea de a anula.
• Funcționează fără internet în sală și se sincronizează când revii online.
• Un cerc pentru obiectivul săptămânal și serii de săptămâni, nu o serie zilnică ce te penalizează pentru zilele de odihnă.
• Bibliotecă de exerciții cu fotografii, indicații, greșeli frecvente și demonstrații video.
• Mementouri opționale pentru antrenament și o atenționare blândă dacă ai făcut o pauză lungă.

CONFIDENȚIALITATEA PE PRIMUL LOC
• Chefer te întreabă înainte să-ți păstreze informațiile despre sănătate și înainte să trimită ceva unui serviciu de inteligență artificială. Datele tale nu sunt folosite niciodată pentru antrenarea modelelor AI.
• Fără reclame, fără vânzare de date. Îți poți exporta datele sau șterge contul din aplicație oricând.

Chefer funcționează pe iPhone și pe web, la chefer.duckdns.org, cu același cont.

Chefer oferă îndrumări generale pentru planificarea meselor și pentru mișcare. Nu este un dispozitiv medical și nu oferă sfaturi medicale. Discută cu un medic sau cu un nutriționist înainte de schimbări importante în alimentație sau antrenament, mai ales dacă ai o afecțiune.
```

[3,329]

### Keywords (≤ 100, comma-separated, no spaces)

```
rețete,cumpărături,calorii,macro,nutriție,dietă,alergii,forță,gătit,greutate,mâncare,fitness,listă
```

[98]. Leave out the words already in the name and subtitle (plan, mese, sală, săptămânii); Apple indexes those already.
Some Romanian searches type without diacritics ("retete", "cumparaturi"). Apple matches both, so you don't need to list
both spellings.

### What's New (first update with Romanian)

```
• Chefer vorbește acum românește: alege limba din Setări › Limbă sau las-o la fel ca telefonul.
• Emailurile săptămânale vin în limba aleasă.
```

[141]

---

## Google Play (Play Console → Main store listing → Manage translations → Romanian)

### App name (≤ 30)

```
Chefer: Plan de mese și sală
```

[28]

### Short description (≤ 80)

```
Mesele săptămânii, lista de cumpărături și antrenamentele tale, într-un loc.
```

[76]

### Full description (≤ 4000)

Use the App Store description above, with one change. Its next-to-last paragraph says "pe iPhone", so on Play replace it
with:

```
Chefer funcționează pe Android și pe web, la chefer.duckdns.org, cu același cont.
```

---

## For the owner to check

1. **Subtitle and promotional text.** The literal translations are too long. The listing uses the shorter versions:
   - `Mesele săptămânii și sala` as the subtitle;
   - the 146-character promotional text.
2. **"Sală" or "gym".** Both are common in Romanian. This draft uses "sală" (the store name "Plan de mese și sală"). If
   your audience searches "gym", put it in the keywords instead of "fitness".
3. **"tu" register.** The listing addresses the reader as "tu", like the app.
4. **Screenshots.** The current sets are English. A Romanian set should be captured after phase 4, with the same
   `aso-creatives-v1` layouts and the app switched to Română.
