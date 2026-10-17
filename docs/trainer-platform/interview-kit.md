# Trainer interview kit (WP-18, 1:1 model)

_Revised 2026-10-04 for the 1:1 coaching model in [spec.md](./spec.md). It replaces the group / "publish the week" kit
of 2026-10-03. Goal: before Phase 1 code merges, learn from **one** trainer (the owner's wife's trainer) how they plan
and adjust individual clients today, and whether the three screens in section 4 would replace what they do now._

**Who:** the owner's wife's trainer. One conversation, about 20 minutes, in Romanian if they prefer (section 2 has the
Romanian questions). If more trainers become available later, reuse the same kit and the survey in section 3.

**Ground rules:**

- Ask about **real clients and last week**, not habits in general ("the last client you changed a program for…").
- Show nothing until part 6.
- Write down their exact words, especially about time, money and anything they'd refuse.
- **Injuries and health:** ask only to learn how they tailor routines. Say so out loud: "The app won't store anything
  about injuries or health. I'm asking to understand how you work." Don't write client names or health details in the
  notes; write "client A, knee" at most.
- The owner's wife is a client of this trainer: keep her out of the examples so the trainer speaks freely.
- Thank them with a free year of Premium if they want it.

After the call, write the notes into `docs/trainer-platform/interview-notes-<date>.md` (no client names, no health
details) and fill in the "what would change the MVP" table in spec §12.

---

## 1. The 20-minute interview (English)

### Part 1: planning individual clients today (4 min)

1. Think of the **last client** you wrote or changed a program for. Walk me through it: when, where (paper, phone,
   laptop, an app), and how long it took.
2. How many clients do you have on an individual program right now? How many of them train **without you** for some
   sessions?
3. How different are your clients' programs? Do you start from a base program and tailor it, or write each one from
   scratch?

### Part 2: adjusting over time (4 min)

_(Only to learn. The app won't store health information.)_

4. When do you change a client's program? Every week, every few weeks, when they stall, when something hurts?
5. Last time a client had a pain or an injury, what did you change in their plan? Where did you write down why?
6. When you prepare the **next session** for someone, what do you decide in advance: the weights, the reps, the
   exercises? Do you ever change exercises **for one session only** (equipment busy, a sore knee) and go back after?

### Part 3: how clients get and follow the plan (3 min)

7. How does a client get their program today? Paper, a photo, WhatsApp, a PDF, an app, or you tell them on the day?
8. When they train alone, how do you know what they did? Do they send you anything?
9. What goes wrong most often: they forget the weights, they skip sessions, they do the wrong exercises?

### Part 4: what you'd want to see after sessions (2 min)

10. After a client trains alone, what would you want to see? Weights and reps per set? How hard it felt? Only whether
    they went?
11. Would you look at it before each session, once a week, or only when something seems off?

### Part 5: phone or computer (1 min)

12. Where would you plan programs: on a computer at home, or on your phone between sessions? And where would you check
    what clients did?

### Part 6: the mock, three screens (5 min). See section 4

13. "Here's an idea." Show screen 1 (clients), then 2 (one client's routine), then 3 (last workouts). On each: "What
    would you do first here?" Then stay silent.
14. "Would you use this **instead of** how you do it today? For which clients? What would stop you?"
15. "What's missing that would make it a no?" (If they say chat or food: "What would you do with it?" Don't promise
    anything.)

### Part 7: money and close (1 min)

16. "It's free while we test it. Later, would a trainer pay for something like this? How much a month would feel fair,
    and for how many clients?"
17. "Can we come back with a test version in a few weeks, for you and two or three of your clients?"

**Listen for:**

- **Next-session decisions.** Weights and reps → our next-session targets fit. One-off exercise swaps → spec later
  slice 2 moves up.
- **Base program + tailoring** → "Fill from one of my routines" and program templates (later slice 4) matter more.
- **Where tailoring knowledge lives** (head, notebook, phone notes) → confirms the private-notes design.
- **What they want back after sessions** → whether Workouts or Adherence leads the client screen.
- **Phone vs computer** → which trainer lane ships first if we must choose (spec Q-9).
- **Money** → spec Q-3.
- **Deal-breakers** (chat, food, groups) → record them, don't design them now.

---

## 2. Interviul de 20 de minute (română)

_Formularea folosește „tu”. Treci la „dumneavoastră” dacă așa vă vorbiți de obicei._

**Înainte de început:** „Durează cam 20 de minute. Lucrez la Chefer, o aplicație de mâncare și sală, și vreau să
înțeleg cum lucrezi cu clienții individuali. Nu există răspunsuri greșite. Te întreb și despre accidentări, dar doar ca
să înțeleg cum adaptezi programele: aplicația nu va păstra nicio informație despre sănătatea cuiva.”

### Partea 1: cum planifici azi pentru fiecare client (4 min)

1. Gândește-te la **ultimul client** pentru care ai scris sau ai schimbat un program. Cum ai făcut: când, unde (pe
   hârtie, pe telefon, pe laptop, într-o aplicație) și cât ți-a luat?
2. Câți clienți ai acum cu program individual? Câți dintre ei se antrenează și **fără tine** în unele zile?
3. Cât de diferite sunt programele clienților tăi? Pornești de la un program de bază pe care îl adaptezi, sau îl scrii
   de la zero pentru fiecare?

### Partea 2: cum schimbi programul în timp (4 min)

_(Doar ca să înțelegem. Aplicația nu va păstra informații despre sănătate.)_

4. Când schimbi programul unui client? În fiecare săptămână, la câteva săptămâni, când stagnează, când îl doare ceva?
5. Ultima dată când un client a avut o durere sau o accidentare, ce ai schimbat în program? Unde ai notat de ce?
6. Când pregătești **următorul antrenament** al cuiva, ce hotărăști dinainte: greutățile, repetările, exercițiile? Se
   întâmplă să schimbi un exercițiu **doar pentru o singură ședință** (aparat ocupat, un genunchi care doare) și apoi să
   revii?

### Partea 3: cum primesc și urmează clienții programul (3 min)

7. Cum primește un client programul azi? Pe hârtie, o poză, pe WhatsApp, un PDF, o aplicație, sau îi spui pe loc?
8. Când se antrenează singur, de unde știi ce a făcut? Îți trimite ceva?
9. Ce merge prost cel mai des: uită greutățile, sare peste antrenamente, face alte exerciții?

### Partea 4: ce ai vrea să vezi după antrenamente (2 min)

10. După ce un client s-a antrenat singur, ce ai vrea să vezi? Greutățile și repetările pe fiecare serie? Cât de greu
    i-a fost? Doar dacă a mers?
11. Te-ai uita înainte de fiecare ședință, o dată pe săptămână, sau doar când ți se pare că ceva nu e în regulă?

### Partea 5: telefon sau calculator (1 min)

12. Unde ai face programele: pe calculator acasă sau pe telefon între ședințe? Și unde te-ai uita la ce au făcut
    clienții?

### Partea 6: macheta, trei ecrane (5 min). Vezi secțiunea 4

13. „Uite o idee.” Arată ecranul 1 (clienții), apoi 2 (programul unui client), apoi 3 (ultimele antrenamente). La
    fiecare: „Ce ai face prima dată aici?” Apoi taci și lasă-l să exploreze.
14. „Ai folosi asta **în loc de** ce faci acum? Pentru ce clienți? Ce te-ar opri?”
15. „Ce lipsește ca să spui «nu»?” (Dacă spune chat sau mâncare: „Ce ai face cu el?” Nu promite nimic.)

### Partea 7: bani și încheiere (1 min)

16. „Cât timp o testăm e gratuită. Mai târziu, ar plăti un antrenor pentru așa ceva? Cât pe lună ți s-ar părea corect,
    și pentru câți clienți?”
17. „Putem reveni peste câteva săptămâni cu o versiune de test, pentru tine și doi-trei dintre clienții tăi?”

---

## 3. Five-question survey (for other trainers later)

Send it in Romanian and English (a Google Form or Tally). It takes about 2 minutes.

| #   | English                                                                                                                                                                              | Română                                                                                                                                                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | How do your clients get their individual program today? _(Paper / WhatsApp or messages / PDF or spreadsheet / A coaching app (which?) / I tell them on the day)_                     | Cum primesc azi clienții programul lor individual? _(Pe hârtie / Pe WhatsApp sau mesaj / PDF sau Excel / O aplicație de coaching (care?) / Le spun pe loc)_                                             |
| 2   | How many clients do you have on an individual program? _(1–5 / 6–15 / 16–30 / 30+)_                                                                                                  | Câți clienți ai cu program individual? _(1–5 / 6–15 / 16–30 / peste 30)_                                                                                                                                |
| 3   | When you prepare a client's next session, what do you change most often? _(Weights and reps / Exercises, for good / Exercises, for one session only / Nothing, the program repeats)_ | Când pregătești următorul antrenament al unui client, ce schimbi cel mai des? _(Greutăți și repetări / Exerciții, definitiv / Exerciții, doar pentru o ședință / Nimic, programul se repetă)_           |
| 4   | Would you edit your clients' programs in an app if they logged their sets there and you could see what they did? _(Yes, now / Maybe / No, because… [free text])_                     | Ai modifica programele clienților într-o aplicație dacă ei își notează acolo seriile și tu vezi ce au făcut? _(Da, chiar acum / Poate / Nu, pentru că… [text liber])_                                   |
| 5   | Who should pay for a coaching app? _(Me, per month / My clients / Included in the gym membership / It should be free)_ and, if "Me", the most you'd pay per month _(free text)_      | Cine ar trebui să plătească o aplicație de coaching? _(Eu, lunar / Clienții mei / Inclusă în abonamentul sălii / Ar trebui să fie gratuită)_ și, dacă „Eu”, cât ai plăti maximum pe lună _(text liber)_ |

---

## 4. Mock brief: three screens of the 1:1 model

Build it as a static HTML page or in Figma: **desktop width for screens 1 and 2, phone width for screen 3**. One path,
no login, no real data. Use Romanian copy for this trainer (shown in brackets) and exercise names from the Chefer
library.

### Screen 1: Clients (trainer, web)

- Title **Clients** (**Clienți**), button **Invite a client** (**Invită un client**).
- A table of 5 made-up clients: name, client since, **last workout** ("Tue 30 Sep" / „mar. 30 sept.”), **this week**
  ("2 / 3"), a grey "Nothing logged for 9 days" (**Nimic notat de 9 zile**) on one row, and "Routine changed by Ioana ·
  3 Oct" (**Rutină schimbată de Ioana · 3 oct.**) on another.
- One pending invite: "Mihai, Tue/Thu · link expires in 12 days" (**linkul expiră în 12 zile**).

Ask: "Who would you open first, and why?"

### Screen 2: One client's routine, with next-session adjustments and notes (trainer, web)

- Header: the client's name and tabs **Routine · Workouts · Adherence** (**Rutină · Antrenamente · Prezență**). A
  **Private notes** (**Notițe private**) panel on the right: "Only you can see this." (**Doar tu vezi asta.**)
- Three day columns (Day A Mon, Day B Wed, Day C Fri). **Day B** is highlighted: "**Next session** · Wed"
  (**Următorul antrenament · mier.**).
- Each exercise row: name, sets × reps, rest, and a **Note for Ioana** field (**Notă pentru Ioana**), e.g. "Knees out,
  slow on the way down" (**Genunchii în afară, coborâre lentă**).
- Under each exercise of Day B: "**Next time:** 60 kg × 8, 8, 8 · app suggestion" (**Data viitoare: … · sugestia
  aplicației**) with **Adjust** (**Ajustează**). One row already adjusted: "62.5 kg × 6, 6, 6, 6 · set by you 2 Oct"
  (**setat de tine pe 2 oct.**) with **Back to app suggestion** (**Revino la sugestia aplicației**).
- One row tagged "Changed by Ioana · 3 Oct" (**Schimbat de Ioana · 3 oct.**).
- **Add exercise** (**Adaugă exercițiu**) opens the library search (no free text). **Save** (**Salvează**).

Ask: "Change Wednesday's squat for her. What would you do?" Then: "And if her knee hurts this week only?" (Listen: do
they expect a one-session swap?)

### Screen 3: The client's last workouts (trainer, phone)

- A **Workouts** (**Antrenamente**) list: "Wed 1 Oct · Day B · 52 min" and so on.
- One expanded: per exercise the sets ("60 kg × 8, 8, 7"), a small "last set: 1 rep left" (**ultima serie: încă 1
  repetare**), and a skipped exercise greyed out.
- An **Adherence** (**Prezență**) strip for 14 days: planned days trained ✓, missed ✗, and a paused week shown as
  "Paused" (**Pauză**) with no reason.
- A footer: "Ioana shares this with you. She can stop any time." (**Ioana îți arată asta. Poate opri oricând.**)

Ask: "What do you look for here? What's missing? What would you never use?"

**Success signal for the MVP as specced:** the trainer says they would use screens 2 and 3 **instead of** their
current channel for at least some clients, and names next-session weights or seeing what was done (not chat, food or
groups) as the reason.
