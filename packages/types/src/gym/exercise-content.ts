// Coaching content per curated exercise, keyed by slug (see exercise-catalog.ts).
// Source: docs/gym/exercise-library-research.md — cues/mistakes are written in
// Chefer's own words; media ids are verified (oEmbed) YouTube clips and
// public-domain free-exercise-db photo ids. Owned by gym_plan.md G0-4 / G1-D.

import type { ExerciseCatalogEntry } from './exercise-catalog';

export type ExerciseContent = Pick<
  ExerciseCatalogEntry,
  'cues' | 'mistakes' | 'blurb' | 'freeExerciseDbId' | 'videoId' | 'videoStartSec' | 'videoChannel'
> & { aliases?: string[] };

/**
 * Missing entries render as "no cues yet"; the catalog invariant test lists them.
 *
 * Video picks: verified via YouTube oEmbed (title/channel match) as of 2026-09-24.
 * Timestamps for exercises that share a multi-exercise "ranking" video were
 * checked against that video's own chapter markers (or transcript, where chapters
 * didn't split finely enough) rather than trusted as self-reported guesses.
 * See docs/gym/exercise-library-research.md "QA table (G1-D)" for the full record.
 */
export const EXERCISE_CONTENT: Record<string, ExerciseContent> = {
  // T-05.10 (library staples, UX-05 A5, AC27-29). videoId left null — no
  // video pick has been oEmbed-verified for these two yet (handoff: see
  // apps/api/static/exercises/README.md "content gaps").
  'incline-barbell-bench-press': {
    cues: [
      'Set the bench to 30-45 degrees, not steeper.',
      'Unrack over your shoulders, then lower to the top of your chest.',
      'Drive the bar back up and slightly toward your face.',
    ],
    mistakes: [
      'Setting the incline too steep, turning it into a shoulder press.',
      'Letting the bar drift toward your neck instead of your upper chest.',
    ],
    blurb:
      'The barbell version of the incline press — heavier loading than dumbbells once the shoulder groove is comfortable.',
    freeExerciseDbId: 'Barbell_Incline_Bench_Press_-_Medium_Grip',
    videoId: 'lJ2o89kcnxY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'back-extension': {
    cues: [
      'Hinge at the hips, not the lower back, on the way down.',
      'Stop level with your body — don’t hyperextend past straight.',
      'Squeeze your glutes to drive back up.',
    ],
    mistakes: [
      'Rounding the lower back to chase extra range of motion.',
      'Snapping upright with momentum instead of a controlled squeeze.',
    ],
    blurb:
      'A no-barbell way to load the lower back, glutes and hamstrings together; hold a plate to keep progressing once bodyweight is easy.',
    freeExerciseDbId: 'Hyperextensions_Back_Extensions',
    videoId: '5_ejbGfdAQE',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
    aliases: ['Hyperextension', 'Roman Chair', 'Hyperextension Bench'],
  },
  'barbell-bench-press': {
    cues: [
      'Drag the bar down your body, not straight down.',
      'Pull your shoulder blades together and keep them pinned.',
      'Push the bar toward the ceiling above your eyes.',
      'Keep your feet driving into the floor all rep.',
    ],
    mistakes: [
      'Flaring elbows to 90 degrees, hammering the shoulders.',
      'Bouncing the bar off the chest instead of controlling it.',
    ],
    blurb:
      'The benchmark horizontal press for chest size and pressing strength; belongs in almost every upper-body day.',
    freeExerciseDbId: 'Barbell_Bench_Press_-_Medium_Grip',
    videoId: 'vcBig73ojpE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'dumbbell-bench-press': {
    cues: [
      'Let the dumbbells travel below the bench for a full stretch.',
      'Drive up and slightly inward, almost touching at the top.',
      'Keep your wrists stacked directly over your elbows.',
    ],
    mistakes: [
      'Letting elbows drop too far and flare, stressing the shoulder.',
      'Losing dumbbell path control, letting them drift forward/back.',
    ],
    blurb:
      'Free range of motion and independent arms make this a strong hypertrophy alternative or finisher to the barbell press.',
    freeExerciseDbId: 'Dumbbell_Bench_Press',
    videoId: 'YQ2s_Y7g5Qk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'incline-dumbbell-press': {
    cues: [
      'Set the bench to 30-45 degrees, not steeper.',
      'Tuck the dumbbells over your collarbone, elbows under wrists.',
      'Press up and slightly back, toward your eyes.',
    ],
    mistakes: [
      'Setting the incline too steep, turning it into a shoulder press.',
      'Flaring elbows out wide at the bottom, straining the front delt.',
    ],
    blurb:
      'The best-supported way to bias upper-chest development without turning the lift into a shoulder press.',
    freeExerciseDbId: 'Incline_Dumbbell_Press',
    videoId: '5CECBjd7HLQ',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'machine-chest-press': {
    cues: [
      'Set the seat so handles line up with mid-chest.',
      'Press forward and squeeze your chest together at lockout.',
      'Control the negative instead of letting the stack drop.',
    ],
    mistakes: [
      'Seat set too high, turning it into a shoulder-dominant press.',
      'Bouncing off the stack between reps instead of pausing.',
    ],
    blurb:
      'A joint-friendly, easy-to-load option for beginners and for chasing extra volume near the end of a session.',
    freeExerciseDbId: 'Machine_Bench_Press',
    videoId: 'NwzUje3z0qY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-fly': {
    cues: [
      'Keep a slight, fixed bend in the elbows all rep.',
      'Lead with your hands hugging a barrel, not pushing.',
      'Squeeze and hold half a second at full contraction.',
    ],
    mistakes: [
      'Bending the elbows more at the top, turning it into a press.',
      'Using so much weight the shoulders round forward at the stretch.',
    ],
    blurb:
      'The best isolated chest stretch-and-squeeze movement — cables (or a pec deck) keep tension on the chest at full stretch, which presses lose.',
    freeExerciseDbId: 'Flat_Bench_Cable_Flyes',
    videoId: '-EIhKMDSjBY',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'push-up': {
    cues: [
      'Keep a straight line from head to heels the whole rep.',
      'Spread the floor apart with your hands to engage the chest.',
      "Lower until your chest is a fist's width from the floor.",
    ],
    mistakes: [
      'Letting the hips sag or pike up instead of staying rigid.',
      'Flaring the elbows straight out to the sides.',
    ],
    blurb:
      'A zero-equipment horizontal push that scales from beginners to advanced — essential for any bodyweight-only day.',
    freeExerciseDbId: 'Pushups',
    videoId: 'IvCknxXOgSA',
    videoStartSec: 568,
    videoChannel: 'Renaissance Periodization',
  },
  'chest-dip': {
    cues: [
      'Lean your torso forward and let your elbows flare slightly.',
      'Lower until your shoulders dip just below your elbows.',
      'Drive back up by pushing the bars down and away.',
    ],
    mistakes: [
      'Staying too upright, shifting load onto the triceps instead.',
      'Dropping too deep, letting the shoulders roll forward at bottom.',
    ],
    blurb:
      'A forward-lean dip loads the lower chest hard and is easy to add weight to once bodyweight reps get easy.',
    freeExerciseDbId: 'Dips_-_Chest_Version',
    videoId: 'yN6Q1UI_xkE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'pull-up': {
    cues: [
      'Drive your elbows down to your hips, not just up.',
      'Lead the pull with your chest toward the bar.',
      'Get a full stretch at the bottom before pulling again.',
    ],
    mistakes: [
      'Kipping/swinging to cheat the rep instead of pulling strict.',
      'Stopping short of full elbow extension at the bottom.',
    ],
    blurb:
      'The gold-standard vertical pull for lat width; scales with bands (assisted) or a dip belt (weighted) as strength changes.',
    freeExerciseDbId: 'Pullups',
    videoId: 'Hdc7Mw6BIEE',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'chin-up': {
    cues: [
      'Keep your elbows close to your torso as you pull.',
      'Pull your chest to the bar, not your chin over it.',
      'Squeeze your shoulder blades down before you start pulling.',
    ],
    mistakes: [
      'Using hip momentum to kick-start the pull.',
      'Only doing half-reps and never fully extending the arms.',
    ],
    blurb: 'The underhand grip biases biceps more than the pull-up while still hammering the lats.',
    freeExerciseDbId: 'Chin-Up',
    videoId: '9JC1EwqezGY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'assisted-pull-up': {
    cues: [
      'Loop the band so it supports you at the hips, not knees.',
      'Still drive your elbows down and back on every rep.',
      "Lower yourself slowly — don't let the band snap you up.",
    ],
    mistakes: [
      'Leaning on too much assistance, turning it into a bounce.',
      'Letting the band do the top-range work you should own.',
    ],
    blurb:
      'Lets beginners groove the exact pull-up movement pattern under reduced load and progress toward an unassisted rep.',
    freeExerciseDbId: 'Band_Assisted_Pull-Up',
    videoId: 'vKpqOpjJt18',
    videoStartSec: 13,
    videoChannel: 'Renaissance Periodization',
  },
  'lat-pulldown': {
    cues: [
      'Lead with your elbows driving down toward your back pockets.',
      'Lean back only slightly — a few degrees, not a swing.',
      'Pause and squeeze your lats before the bar rises back up.',
    ],
    mistakes: [
      'Yanking the bar down with a big backward lean.',
      'Pulling the bar behind the head, straining the shoulder.',
    ],
    blurb:
      'A machine-regulated, easy-to-load stand-in for the pull-up — lets beginners build the same pattern at any load.',
    freeExerciseDbId: 'Wide-Grip_Lat_Pulldown',
    videoId: 'O94yEoGXtBY',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'barbell-row': {
    cues: [
      'Hinge to about 45 degrees and hold that angle all set.',
      'Row the bar into your lower ribs, not your chest.',
      'Squeeze your shoulder blades together at the top of every rep.',
    ],
    mistakes: [
      'Standing more upright as the set gets hard, becoming a shrug.',
      'Using a big body heave/jerk to move the weight.',
    ],
    blurb:
      'The classic horizontal pull for back thickness; the hip hinge also reinforces deadlift positioning.',
    freeExerciseDbId: 'Bent_Over_Barbell_Row',
    videoId: 'RQU8wZPbioA',
    videoStartSec: 0,
    videoChannel: 'Alan Thrall (Untamed Strength)',
  },
  'chest-supported-row': {
    cues: [
      "Let your chest rest fully on the pad — don't hover.",
      'Row your elbows up and back, starting a lawnmower.',
      'Pause and squeeze between your shoulder blades at the top.',
    ],
    mistakes: [
      'Lifting the chest off the pad to cheat extra range.',
      'Shrugging the weight up with traps instead of rowing.',
    ],
    blurb:
      'Removes lower-back fatigue and cheat-momentum from rowing, so the upper-back muscles get pushed harder and safer.',
    freeExerciseDbId: 'Lying_T-Bar_Row',
    videoId: 'jLvqKgW-_G8',
    videoStartSec: 533,
    videoChannel: 'Jeff Nippard',
  },
  'seated-cable-row': {
    cues: [
      "Sit tall and keep your torso still — don't rock.",
      'Drive your elbows straight back past your ribs.',
      'Round your shoulders forward slightly at the stretch, then reset tall.',
    ],
    mistakes: [
      'Rocking the torso back and forth to add momentum.',
      'Shrugging the shoulders up toward the ears during the pull.',
    ],
    blurb: 'A stable, seated way to load horizontal back volume without any lower-back strain.',
    freeExerciseDbId: 'Seated_Cable_Rows',
    videoId: 'jLvqKgW-_G8',
    videoStartSec: 562,
    videoChannel: 'Jeff Nippard',
  },
  'single-arm-dumbbell-row': {
    cues: [
      'Brace your free hand on the bench, keep your back flat.',
      'Row your elbow up toward your hip, not out sideways.',
      'Let the dumbbell hang and stretch your lat at the bottom.',
    ],
    mistakes: [
      'Twisting the torso to help heave the weight up.',
      'Cutting the range short, never letting the arm fully extend.',
    ],
    blurb:
      'Unilateral loading drives a deep lat stretch and fixes side-to-side imbalances bilateral rows can hide.',
    freeExerciseDbId: 'One-Arm_Dumbbell_Row',
    videoId: 'DMo3HJoawrU',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'face-pull': {
    cues: [
      'Pull the rope apart toward your eyes, not your throat.',
      'Finish with thumbs pointing behind you, like drawing a bow.',
      'Lead the pull keeping your elbows high the whole time.',
    ],
    mistakes: [
      'Pulling low toward the chest, turning it into a row.',
      'Using too much weight, losing the external-rotation finish.',
    ],
    blurb:
      'The single best cable move for rear-delt and rotator-cuff health — cheap insurance for shoulder longevity.',
    freeExerciseDbId: 'Face_Pull',
    videoId: 'cc0tasCalHg',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'straight-arm-pulldown': {
    cues: [
      'Keep a soft, fixed bend in the elbows all rep.',
      'Sweep the bar down in an arc, leading with your lats.',
      'Feel the stretch overhead before starting each rep.',
    ],
    mistakes: [
      'Bending the elbows more on the way down, becoming a pushdown.',
      'Using shoulders/torso to yank the weight instead of the lats.',
    ],
    blurb:
      'Isolates the lats through shoulder extension without elbow flexion, so grip/bicep fatigue never limits the set.',
    freeExerciseDbId: 'Straight-Arm_Pulldown',
    videoId: 'G9uNaXGTJ4w',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'overhead-press': {
    cues: [
      'Squeeze your glutes and brace your abs before you press.',
      'Move your head back and through once the bar clears your face.',
      'Finish by shrugging the bar up under lockout, over your ears.',
    ],
    mistakes: [
      'Leaning back excessively, turning it into an incline press.',
      'Flaring the elbows out to the sides right off the shoulders.',
    ],
    blurb:
      'The most direct test and builder of raw shoulder pressing strength, and it teaches full-body bracing.',
    freeExerciseDbId: 'Standing_Military_Press',
    videoId: '_RlRDWO2jfg',
    videoStartSec: 0,
    videoChannel: 'Jeff Nippard',
  },
  'seated-dumbbell-shoulder-press': {
    cues: [
      'Start with the dumbbells at ear height, not at the shoulders.',
      'Press up and slightly in, finishing near the top of your head.',
      "Keep your ribs down — don't arch to muscle it up.",
    ],
    mistakes: [
      'Excessive lower-back arch to help the last few reps.',
      'Letting the dumbbells drift forward instead of pressing straight up.',
    ],
    blurb:
      'Seated support removes leg-drive cheating so you isolate real shoulder pressing strength.',
    freeExerciseDbId: 'Seated_Dumbbell_Press',
    videoId: 'HzIiNhHhhtA',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'dumbbell-lateral-raise': {
    cues: [
      'Lead the raise with your elbows, pouring water from a jug.',
      'Raise only to shoulder height, not above it.',
      'Tip your pinkies up slightly at the top of the raise.',
    ],
    mistakes: [
      'Swinging the torso to launch the weight with momentum.',
      'Shrugging the traps up to help lift the dumbbells.',
    ],
    blurb:
      'The single best isolation move for round, wide-looking shoulders — side delts respond best to strict light-weight form.',
    freeExerciseDbId: 'Side_Lateral_Raise',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 100,
    videoChannel: 'Jeff Nippard',
  },
  'cable-lateral-raise': {
    cues: [
      'Stand with the cable crossing your body for tension at the bottom.',
      'Raise your arm out to the side, leading with the elbow.',
      'Control the lowering instead of letting the cable snap it down.',
    ],
    mistakes: [
      'Standing too far from the machine, losing tension at the start.',
      'Using the free hand to brace and cheat the weight up.',
    ],
    blurb:
      'Unlike a dumbbell, the cable keeps tension on the side delt even at the bottom, where dumbbells go slack.',
    freeExerciseDbId: 'Cable_Seated_Lateral_Raise',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 477,
    videoChannel: 'Jeff Nippard',
  },
  'reverse-pec-deck': {
    cues: [
      'Lead the movement with your elbows, not your hands.',
      'Keep a soft elbow bend, squeeze your shoulder blades together.',
      "Move slowly — this small muscle doesn't need momentum.",
    ],
    mistakes: [
      'Using too much weight, turning it into a mid-back row.',
      'Letting the hands lead, shifting work off the rear delts.',
    ],
    blurb:
      'The rear delts are chronically undertrained relative to front/side — this machine isolates them with the least technique risk.',
    freeExerciseDbId: 'Reverse_Machine_Flyes',
    videoId: 'SgyUoY0IZ7A',
    videoStartSec: 626,
    videoChannel: 'Jeff Nippard',
  },
  'barbell-curl': {
    cues: [
      'Pin your elbows to your sides and keep them there.',
      'Curl the bar up without swinging your torso to help.',
      'Squeeze hard at the top for a full second.',
    ],
    mistakes: [
      'Swinging the hips/back to sling the weight up.',
      'Letting the elbows drift forward as the weight gets heavy.',
    ],
    blurb:
      'The classic mass-builder for biceps — strict elbow position separates a real curl from a hip-driven swing.',
    freeExerciseDbId: 'Barbell_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 116,
    videoChannel: 'Jeff Nippard',
  },
  'dumbbell-curl': {
    cues: [
      'Keep your elbows pinned to your sides the whole set.',
      'Rotate your palm up as you curl for a full squeeze.',
      'Lower under control instead of dropping the weight down.',
    ],
    mistakes: [
      'Swinging the dumbbells up using body momentum.',
      'Letting the elbows drift forward, turning it into a front raise.',
    ],
    blurb:
      'The simplest, most accessible biceps builder in the gym — a baseline every lifter can load and progress.',
    freeExerciseDbId: 'Dumbbell_Bicep_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 217,
    videoChannel: 'Jeff Nippard',
  },
  'incline-dumbbell-curl': {
    cues: [
      'Let your arms hang straight down from your shoulders to start.',
      'Curl without letting your elbows drift forward off the bench.',
      'Get a full stretch at the bottom of every rep.',
    ],
    mistakes: [
      'Letting the shoulders round forward, killing the stretch.',
      'Rushing the eccentric instead of controlling it down.',
    ],
    blurb:
      'The incline angle pins the shoulder back and stretches the long head of the biceps harder than a standing curl.',
    freeExerciseDbId: 'Incline_Dumbbell_Curl',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 320,
    videoChannel: 'Jeff Nippard',
  },
  'hammer-curl': {
    cues: [
      'Keep your palms facing each other the entire rep.',
      "Curl straight up — don't let the dumbbells swing outward.",
      'Keep your elbows fixed at your sides throughout.',
    ],
    mistakes: [
      'Letting the wrist rotate toward a regular curl grip mid-rep.',
      'Using body momentum instead of a controlled curl.',
    ],
    blurb:
      "The neutral grip shifts emphasis onto the brachialis and forearm, adding arm thickness a supinated curl alone won't.",
    freeExerciseDbId: 'Hammer_Curls',
    videoId: 'GNO4OtYoCYk',
    videoStartSec: 786,
    videoChannel: 'Jeff Nippard',
  },
  'preacher-curl': {
    cues: [
      'Pin your upper arms flat against the pad the whole set.',
      'Stop just short of fully locking out at the bottom.',
      'Squeeze at the top without shrugging your shoulders up.',
    ],
    mistakes: [
      'Bouncing out of the bottom stretch instead of controlling it.',
      'Lifting the upper arms off the pad to cheat reps.',
    ],
    blurb:
      'The preacher angle removes shoulder/momentum help entirely, making it one of the strictest biceps builders available.',
    freeExerciseDbId: 'Preacher_Curl',
    videoId: 'sxA__DoLsgo',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  // Added 2026-10-02 (owner request). videoId left null — no pick has been
  // oEmbed-verified yet (see apps/api/static/exercises/README.md "content gaps").
  'cable-biceps-curl': {
    cues: [
      'Stand a half-step back so the cable pulls at the bottom.',
      'Keep your elbows pinned at your sides the whole set.',
      'Curl to your shoulders and squeeze for a second.',
    ],
    mistakes: [
      'Leaning back to drag the stack up with your body.',
      'Letting the stack slam down instead of lowering it slowly.',
    ],
    blurb:
      'The cable keeps tension on the biceps through the whole rep, including the bottom where a barbell goes slack.',
    freeExerciseDbId: 'Standing_Biceps_Cable_Curl',
    videoId: '2MUEL4nL6hA',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'triceps-pushdown': {
    cues: [
      "Pin your elbows to your sides, don't let them drift.",
      'Push down and slightly spread the rope apart at the bottom.',
      'Control the weight back up instead of letting it fly.',
    ],
    mistakes: [
      'Letting the elbows travel forward away from the torso.',
      'Leaning over the bar, using body weight to push it down.',
    ],
    blurb:
      "A joint-friendly triceps isolation staple that's easy to load precisely for high volume.",
    freeExerciseDbId: 'Triceps_Pushdown',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 60,
    videoChannel: 'Jeff Nippard',
  },
  'overhead-cable-triceps-extension': {
    cues: [
      'Keep your upper arms close to your ears and fixed.',
      'Extend your forearms forward and up, not straight overhead.',
      'Feel a deep stretch behind your elbow at the bottom.',
    ],
    mistakes: [
      'Letting the elbows flare out wide instead of staying narrow.',
      'Moving the shoulders to help instead of isolating the elbow.',
    ],
    blurb:
      'The overhead position stretches the long head of the triceps, the head most pressing/pushdown work neglects.',
    freeExerciseDbId: 'Triceps_Overhead_Extension_with_Rope',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 275,
    videoChannel: 'Jeff Nippard',
  },
  'skull-crusher': {
    cues: [
      'Keep your upper arms vertical and still — only forearms move.',
      'Lower the bar toward your forehead or just past it.',
      'Extend back up under control, without flaring the elbows.',
    ],
    mistakes: [
      'Letting the elbows drift backward/forward instead of staying fixed.',
      'Using too much weight, turning it into a partial-range press.',
    ],
    blurb:
      "A high-stretch triceps builder that, done with strict elbow position, adds size the pushdown's limited range can't.",
    freeExerciseDbId: 'EZ-Bar_Skullcrusher',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 410,
    videoChannel: 'Jeff Nippard',
  },
  'close-grip-bench-press': {
    cues: [
      'Set your grip just inside shoulder width, not fist-narrow.',
      'Keep your elbows tracking close to your torso on the way down.',
      'Drive through your palms and lock out fully at the top.',
    ],
    mistakes: [
      'Gripping too narrow, straining the wrists and elbows.',
      'Letting the elbows flare out, turning it back into a chest press.',
    ],
    blurb:
      'Lets you overload the triceps with real pressing weight — more loading potential than any single-joint triceps move.',
    freeExerciseDbId: 'Close-Grip_Barbell_Bench_Press',
    videoId: 'OpRMRhr0Ycc',
    videoStartSec: 728,
    videoChannel: 'Jeff Nippard',
  },
  'back-squat': {
    cues: [
      'Break at the hips and knees together, not knees first.',
      'Spread the floor apart with your feet to keep knees out.',
      'Keep your ribcage stacked over your hips the whole descent.',
    ],
    mistakes: [
      'Letting the knees cave inward, especially near the bottom.',
      'Losing the neutral spine and rounding the lower back.',
    ],
    blurb:
      'The foundational lower-body compound for quad and total leg mass, and the best transferable strength builder in the gym.',
    freeExerciseDbId: 'Barbell_Squat',
    videoId: 'Po9CDtfcLJI',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'front-squat': {
    cues: [
      'Keep your elbows up high so the bar rests on your shoulders.',
      'Sit straight down between your hips, staying upright through the torso.',
      'Push your knees forward over your toes as you descend.',
    ],
    mistakes: [
      'Letting the elbows drop, dumping the bar off the shoulders.',
      'Leaning forward like a back squat instead of staying vertical.',
    ],
    blurb:
      'The most quad-dominant barbell squat variation — the upright torso shifts far more work onto the quads than a back squat.',
    freeExerciseDbId: 'Front_Squat_Clean_Grip',
    videoId: 'v-mQm_droHg',
    videoStartSec: 242,
    videoChannel: 'Jeff Nippard',
  },
  'hack-squat': {
    cues: [
      'Sink as deep as you comfortably can without your back rounding.',
      'Keep your whole foot planted, weight through heel to toe.',
      "Lower slowly — there's no need to rush the descent.",
    ],
    mistakes: [
      'Stopping the descent short of a full, controlled range.',
      'Letting the lower back round off the pad at depth.',
    ],
    blurb:
      'Loads the quads through a long range with the machine handling balance — a safe way to chase deep-squat quad growth.',
    freeExerciseDbId: 'Hack_Squat',
    videoId: '4cxt_Tldugw',
    videoStartSec: 217,
    videoChannel: 'Renaissance Periodization',
  },
  'goblet-squat': {
    cues: [
      'Hold the weight close to your chest, elbows pointing down.',
      'Use your elbows to nudge your knees out as you sit.',
      'Sit straight down between your heels, staying tall through the chest.',
    ],
    mistakes: [
      'Letting the weight drift away from the chest, pulling you forward.',
      'Rushing the depth instead of controlling the descent.',
    ],
    blurb:
      'The easiest squat pattern to teach beginners — the front-loaded weight naturally keeps the torso upright and depth honest.',
    freeExerciseDbId: 'Goblet_Squat',
    videoId: '8sXVbOBFPig',
    videoStartSec: 480,
    videoChannel: 'Jeff Nippard',
  },
  'leg-press': {
    cues: [
      'Keep your lower back flat against the pad, not rounding.',
      'Lower until knees reach roughly 90 degrees, no deeper if back lifts.',
      'Push through your whole foot, not just your toes.',
    ],
    mistakes: [
      'Letting the hips round off the pad at the bottom.',
      'Locking the knees out hard and bouncing at the top.',
    ],
    blurb: 'Loads the quads hard with none of the balance/bracing demand of a free squat.',
    freeExerciseDbId: 'Leg_Press',
    videoId: 'B6rGDcfyPto',
    videoStartSec: 60,
    videoChannel: 'Renaissance Periodization',
  },
  'romanian-deadlift': {
    cues: [
      'Push your hips straight back like closing a car door with them.',
      'Keep the bar dragging down your thighs the whole way.',
      'Stop at a hard hamstring stretch, not when the back rounds.',
    ],
    mistakes: [
      'Squatting the weight down instead of hinging at the hips.',
      'Rounding the lower back to chase extra range of motion.',
    ],
    blurb:
      'The best hip-hinge movement for hamstrings and glutes while teaching the pattern the deadlift depends on.',
    freeExerciseDbId: 'Romanian_Deadlift',
    videoId: '_oyxCn2iSjU',
    videoStartSec: 82,
    videoChannel: 'Jeff Nippard',
  },
  deadlift: {
    cues: [
      'Take the slack out of the bar before you pull.',
      'Push the floor away with your legs, not your back.',
      'Keep the bar dragging up your shins and thighs the whole pull.',
    ],
    mistakes: [
      'Letting the hips shoot up first, turning it into a stiff-leg pull.',
      'Rounding the lower back to start the pull off the floor.',
    ],
    blurb:
      'The single most complete strength movement in the gym, building the entire posterior chain and grip in one lift.',
    freeExerciseDbId: 'Barbell_Deadlift',
    videoId: 'g2Xl1zJeArs',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'bulgarian-split-squat': {
    cues: [
      'Keep most of your weight on the front foot to balance.',
      'Drop straight down, not forward toward your front knee.',
      'Keep your torso tall through the whole rep.',
    ],
    mistakes: [
      'Placing the back foot too high, stressing the knee.',
      'Letting the front knee cave inward on the way up.',
    ],
    blurb:
      'A brutal single-leg quad and glute builder that also exposes and fixes side-to-side leg imbalances.',
    freeExerciseDbId: null,
    videoId: 'hPlKPjohFS0',
    videoStartSec: 10,
    videoChannel: 'Squat University',
  },
  'walking-lunge': {
    cues: [
      'Take a stride long enough that your front shin stays vertical.',
      'Drop your back knee straight down toward the floor.',
      'Push through your front heel to stand up and step through.',
    ],
    mistakes: [
      'Taking too short a stride, driving the front knee past the toes.',
      'Letting the torso lean forward instead of staying upright.',
    ],
    blurb:
      "Combines a quad/glute lunge with dynamic, athletic carryover that static lunges don't train.",
    freeExerciseDbId: 'Barbell_Walking_Lunge',
    videoId: 'Z6R8A5tcrTc',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'leg-extension': {
    cues: [
      'Adjust the pad to sit just above your ankle, not your shin.',
      'Extend all the way to a full, controlled lockout.',
      'Lower slowly instead of letting the stack drop.',
    ],
    mistakes: [
      'Using momentum/swinging to kick the weight up.',
      'Only using the top half of the range of motion.',
    ],
    blurb:
      'The most direct quad isolation available — a clean way to finish legs after squats/presses.',
    freeExerciseDbId: 'Leg_Extensions',
    videoId: 'ljO4jkwv8wQ',
    videoStartSec: 209,
    videoChannel: 'Jeff Nippard',
  },
  'seated-leg-curl': {
    cues: [
      'Point your toes toward your shins to bias the hamstrings.',
      'Curl through a full range, squeezing hard at the top.',
      "Lower under control — don't let the pad snap back.",
    ],
    mistakes: [
      'Letting the hips rise off the seat to cheat extra range.',
      'Pointing the toes down, shifting work onto the calves.',
    ],
    blurb:
      "Isolates the hamstrings through knee flexion, which hip-dominant RDLs and deadlifts don't hit directly.",
    freeExerciseDbId: 'Seated_Leg_Curl',
    videoId: 'jobEeklwrrs',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'lying-leg-curl': {
    cues: [
      'Keep your hips pressed flat into the bench the whole rep.',
      'Curl through a full range, squeezing hard at the top.',
      'Lower under control instead of letting the pad snap back.',
    ],
    mistakes: [
      'Lifting the hips off the bench to cheat extra range.',
      'Using short, fast partial reps instead of a full curl.',
    ],
    blurb:
      "The prone position removes any hip-drive cheating that's easier to sneak into the seated version.",
    freeExerciseDbId: 'Lying_Leg_Curls',
    videoId: 'jobEeklwrrs',
    videoStartSec: 31,
    videoChannel: 'Renaissance Periodization',
  },
  'hip-thrust': {
    cues: [
      'Tuck your chin and ribs down to stay neutral at lockout.',
      'Drive through your heels, not your toes.',
      'Squeeze your glutes hard at the top and pause a beat.',
    ],
    mistakes: [
      'Overextending the lower back at the top instead of squeezing glutes.',
      'Pushing through the toes, shifting work to the quads.',
    ],
    blurb:
      'The single best loaded glute builder — the horizontal hinge loads the glutes at their strongest range.',
    freeExerciseDbId: 'Barbell_Hip_Thrust',
    videoId: 'xDmFkJxPzeM',
    videoStartSec: 25,
    videoChannel: 'Jeff Nippard',
  },
  'standing-calf-raise': {
    cues: [
      'Get a deep stretch at the bottom before driving back up.',
      'Rise all the way onto your toes and pause at the top.',
      "Move slowly — don't bounce out of the bottom stretch.",
    ],
    mistakes: [
      'Using tiny, bouncy partial reps instead of a full range.',
      'Bending the knees to help push the weight up.',
    ],
    blurb:
      "Trains the gastrocnemius through a long, straight-leg range a seated calf raise can't reach.",
    freeExerciseDbId: 'Standing_Calf_Raises',
    videoId: '21inrjhoFkQ',
    videoStartSec: 236,
    videoChannel: 'Jeff Nippard',
  },
  'seated-calf-raise': {
    cues: [
      'Let your heels drop as low as comfortably possible.',
      'Press up through the balls of your feet to full extension.',
      'Pause briefly at the top before lowering under control.',
    ],
    mistakes: [
      'Rushing through short, bouncy partial reps.',
      'Letting the knees drift forward off the pad.',
    ],
    blurb:
      'The bent-knee position shifts emphasis onto the soleus, the calf muscle standing raises undertrain.',
    freeExerciseDbId: 'Seated_Calf_Raise',
    videoId: '21inrjhoFkQ',
    videoStartSec: 469,
    videoChannel: 'Jeff Nippard',
  },
  'hanging-knee-raise': {
    cues: [
      'Curl your pelvis under at the top, not just swinging.',
      'Keep the movement slow — no swinging from the shoulders.',
      'Lower under control until your legs are fully straight.',
    ],
    mistakes: [
      'Using momentum/swinging instead of a controlled hip-flexion curl.',
      'Stopping the raise at hip height without curling the pelvis.',
    ],
    blurb:
      "One of the few ab exercises that trains real resisted hip flexion, which planks/crunches don't provide.",
    freeExerciseDbId: 'Hanging_Leg_Raise',
    videoId: 'RD_A-Z15ER4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-crunch': {
    cues: [
      'Round your spine, crunching your ribs toward your hips.',
      "Keep hips fixed — it's a spine move, not a hip move.",
      'Squeeze and hold for a second at full contraction.',
    ],
    mistakes: [
      'Pulling with the arms/lats instead of crunching with the abs.',
      'Moving the hips back and forth instead of flexing the spine.',
    ],
    blurb:
      "Lets you add external load to a crunch, which bodyweight ab work eventually can't progress past.",
    freeExerciseDbId: 'Cable_Crunch',
    videoId: '6GMKPQVERzw',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  plank: {
    cues: [
      'Squeeze your glutes and brace your abs, like bracing for a punch.',
      'Keep a straight line from your ears to your ankles.',
      'Breathe steadily instead of holding your breath.',
    ],
    mistakes: [
      'Letting the hips sag toward the floor as fatigue sets in.',
      'Piking the hips up to make the hold easier.',
    ],
    blurb:
      "Trains the abs' real job — resisting spinal extension under load — and doubles as a low-risk core baseline.",
    freeExerciseDbId: null, // WP-25: the dataset's "Plank" photo shows a lunge stretch; the photo is now an AI render
    videoId: '1G0y8D5rFDc',
    videoStartSec: 74,
    videoChannel: 'Jeff Nippard',
  },
  'ab-wheel-rollout': {
    cues: [
      'Brace your abs hard before you start rolling out.',
      'Roll out only as far as you can keep your back flat.',
      'Pull yourself back using your abs, not just your arms.',
    ],
    mistakes: [
      'Letting the lower back arch/sag at full extension.',
      'Rolling out farther than you can control back from.',
    ],
    blurb:
      'One of the hardest anti-extension core exercises available — builds bracing strength that protects the spine in squats and deadlifts.',
    freeExerciseDbId: 'Ab_Roller',
    videoId: '1G0y8D5rFDc',
    videoStartSec: 302,
    videoChannel: 'Jeff Nippard',
  },
  'pallof-press': {
    cues: [
      "Stand sideways to the cable so it's constantly trying to twist you.",
      'Press straight out and resist any rotation in your torso.',
      'Brace your abs before you press, not after you feel the pull.',
    ],
    mistakes: [
      'Letting the torso rotate toward the cable instead of resisting.',
      'Pressing from a stance too narrow to stay stable.',
    ],
    blurb:
      "Trains the core's anti-rotation function directly, which is what protects the spine during real-world twisting loads.",
    freeExerciseDbId: 'Pallof_Press',
    videoId: 'mpGF2t51IWE',
    videoStartSec: 21,
    videoChannel: 'Squat University',
  },
  'dumbbell-shrug': {
    cues: [
      'Lift straight up toward your ears, not up and back.',
      'Pause and hold a full second at the top.',
      'Lower under control instead of dropping the weight.',
    ],
    mistakes: [
      'Rolling the shoulders in a circle instead of a straight shrug.',
      'Using knee momentum to help start the lift.',
    ],
    blurb:
      'The traps have no other direct exercise in the base list, and they\'re a highly visible muscle for a "strength library" — a glaring gap without this.',
    freeExerciseDbId: 'Dumbbell_Shrug',
    videoId: '_t3lrPI6Ns4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'farmers-carry': {
    cues: [
      'Set your shoulders back and down before your first step.',
      'Take short, quick steps rather than long, swinging strides.',
      'Keep your ribs stacked over your hips the whole walk.',
    ],
    mistakes: [
      'Letting the shoulders round forward and the weights swing.',
      'Leaning to one side to compensate for grip fatigue.',
    ],
    blurb:
      'A full-body strength and grip builder no other exercise on this list trains — practical, low-technical-risk total-body work.',
    freeExerciseDbId: 'Farmers_Walk',
    videoId: 'kL5ZQqrDQlc',
    videoStartSec: 0,
    videoChannel: 'Alan Thrall (Untamed Strength)',
  },
  'cable-pull-through': {
    cues: [
      'Push your hips back toward the machine, not just bending forward.',
      'Let the rope pull through between your legs at the bottom.',
      'Finish by squeezing your glutes hard, standing fully tall.',
    ],
    mistakes: [
      'Squatting the weight instead of hinging at the hips.',
      'Rounding the lower back to reach further at the bottom.',
    ],
    blurb:
      "A self-limiting hinge pattern that's easier for hinge-shy beginners to learn than an RDL, while still building real glute/hamstring strength.",
    freeExerciseDbId: 'Pull_Through',
    videoId: '3ryh7PNhz3E',
    videoStartSec: 753,
    videoChannel: 'Jeff Nippard',
  },
  'hip-abduction-machine': {
    cues: [
      'Sit tall with your lower back flat against the pad.',
      'Push your knees apart using your outer hips, not feet.',
      'Control the return instead of letting the pads snap together.',
    ],
    mistakes: [
      'Leaning the torso forward to add momentum.',
      'Using tiny, fast partial reps instead of a full range.',
    ],
    blurb:
      'Directly targets the glute medius — a hip stabilizer in every squat, lunge, and single-leg move, with no other direct exercise on this list.',
    freeExerciseDbId: 'Thigh_Abductor',
    videoId: '3ryh7PNhz3E',
    videoStartSec: 500,
    videoChannel: 'Jeff Nippard',
  },
  // ── Home variants (audit F-GYM-2-1) ──
  // Photos: free-exercise-db ids where a faithful match exists, else null.
  // Videos: dedicated single-exercise tutorials, oEmbed-verified 2026-09-26.
  'dumbbell-romanian-deadlift': {
    cues: [
      'Push your hips back as the dumbbells slide down your thighs.',
      'Keep a soft knee bend that never changes.',
      'Stop when your hamstrings stretch, usually just below the knee.',
      'Stand tall by driving your hips forward, not leaning back.',
    ],
    mistakes: [
      'Rounding the lower back to reach the dumbbells lower.',
      'Bending the knees more, turning it into a squat.',
    ],
    blurb:
      'The dumbbell version of the best hamstring builder — same hinge and stretch, loaded with whatever dumbbells you have.',
    freeExerciseDbId: 'Stiff-Legged_Dumbbell_Deadlift',
    videoId: 'aa57T45iFSE',
    videoStartSec: 0,
    videoChannel: 'NASM',
  },
  'dumbbell-hip-thrust': {
    cues: [
      'Rest your upper back on the bench, just below the shoulder blades.',
      'Hold one dumbbell across your hip crease with both hands.',
      'Drive through your heels until hips and knees line up.',
      'Squeeze your glutes and pause a beat at the top.',
    ],
    mistakes: [
      'Arching the lower back at lockout instead of squeezing glutes.',
      'Feet too far away, shifting the work to the hamstrings.',
    ],
    blurb:
      'Hip-thrust glute work for a home setup: one heavy dumbbell on the hips and a bench behind you.',
    freeExerciseDbId: null,
    videoId: '29OfN4ztW_g',
    videoStartSec: 0,
    videoChannel: 'J2FIT Strength & Conditioning',
  },
  'dumbbell-overhead-triceps-extension': {
    cues: [
      'Cup the top of one dumbbell with both hands overhead.',
      'Keep your elbows pointing forward, close to your head.',
      'Lower behind your head until your triceps fully stretch.',
    ],
    mistakes: [
      'Flaring the elbows wide so the shoulders take over.',
      'Arching the lower back to push the weight up.',
    ],
    blurb:
      'Trains the long head of the triceps in its stretched position — the dumbbell stand-in for overhead cable extensions.',
    freeExerciseDbId: 'Seated_Triceps_Press',
    videoId: '-Vyt2QdsR7E',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'dumbbell-skull-crusher': {
    cues: [
      'Lie on the bench with the dumbbells above your shoulders, palms in.',
      'Bend only at the elbows, lowering beside your head.',
      'Keep your upper arms still and angled slightly back.',
    ],
    mistakes: [
      'Letting the elbows drift out and turn it into a press.',
      'Dropping the weights fast instead of controlling the stretch.',
    ],
    blurb:
      'A lying triceps extension with dumbbells: easier on the wrists than a straight bar and needs only a bench.',
    freeExerciseDbId: 'Lying_Dumbbell_Tricep_Extension',
    videoId: 'ir5PsbniVSc',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'dumbbell-reverse-fly': {
    cues: [
      'Lie chest-down on an incline bench, arms hanging straight down.',
      'Keep a slight, fixed bend in the elbows.',
      'Sweep the dumbbells out wide, leading with your pinkies.',
      'Stop at shoulder height; control the way down.',
    ],
    mistakes: [
      'Squeezing the shoulder blades hard so the upper back takes over.',
      'Swinging heavy dumbbells with momentum from the torso.',
    ],
    blurb:
      'Rear-delt isolation with light dumbbells — replaces face pulls and the reverse pec deck when there is no cable or machine.',
    freeExerciseDbId: 'Reverse_Flyes',
    videoId: 'buuYPLVXsJg',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'dumbbell-fly': {
    cues: [
      'Keep a slight bend in the elbows the whole rep.',
      'Open your arms wide until you feel a deep chest stretch.',
      'Bring the dumbbells together like hugging a big tree.',
    ],
    mistakes: [
      'Bending the elbows more on the way up, making it a press.',
      'Going too heavy and dropping too deep at the stretch.',
    ],
    blurb:
      'A chest isolation move that needs only dumbbells and a bench; the stand-in for cable flyes at home.',
    freeExerciseDbId: 'Dumbbell_Flyes',
    videoId: 'LzFvciCdoW0',
    videoStartSec: 0,
    videoChannel: 'Buff Dudes',
  },
  'incline-dumbbell-row': {
    cues: [
      'Lie chest-down on a bench set to about 30 degrees.',
      'Row the dumbbells toward your hips, elbows close to your sides.',
      'Squeeze your shoulder blades together at the top.',
    ],
    mistakes: [
      'Lifting the chest off the pad to cheat the weight up.',
      'Shrugging the shoulders up toward the ears.',
    ],
    blurb:
      'The bench supports your chest, so your back does all the work and your lower back gets a rest.',
    freeExerciseDbId: 'Dumbbell_Incline_Row',
    videoId: 'llFTFDwmGcw',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'dumbbell-calf-raise': {
    cues: [
      'Stand on a step with your heels hanging off the edge.',
      'Lower slowly until your calves fully stretch.',
      'Rise onto the balls of your feet and pause at the top.',
    ],
    mistakes: [
      'Bouncing out of the bottom instead of pausing in the stretch.',
      'Bending the knees to push the weight up.',
    ],
    blurb:
      'Calf work with nothing but dumbbells and a step; the full stretch at the bottom matters more than the load.',
    freeExerciseDbId: 'Standing_Dumbbell_Calf_Raise',
    videoId: 'H6WptvjXkgw',
    videoStartSec: 0,
    videoChannel: 'J2FIT Strength & Conditioning',
  },
  'bodyweight-squat': {
    cues: [
      'Stand with feet shoulder-width apart, toes slightly out.',
      'Sit down between your heels, knees tracking over your toes.',
      'Go as deep as you can with your chest up.',
      'Drive up through the whole foot.',
    ],
    mistakes: [
      'Letting the heels lift off the floor at the bottom.',
      'Cutting depth short as the set gets hard.',
    ],
    blurb:
      'The starting point for bodyweight leg training. Once 30 clean reps feel easy, move on to split squats.',
    freeExerciseDbId: 'Bodyweight_Squat',
    videoId: 'ZLJBfYF_oO0',
    videoStartSec: 0,
    videoChannel: 'Born Fitness',
  },
  'reverse-lunge': {
    cues: [
      'Step back far enough that your front shin stays vertical.',
      'Drop your back knee straight down toward the floor.',
      'Push through your front heel to return to standing.',
    ],
    mistakes: [
      'Letting the front knee cave inward on the way up.',
      'Pushing off the back foot instead of the front leg.',
    ],
    blurb:
      'Easier on the knees than a forward lunge and needs no room to walk; count reps per leg.',
    freeExerciseDbId: null,
    videoId: 'u_zSfK5ZFU4',
    videoStartSec: 0,
    videoChannel: 'BuiltLean',
  },
  'bodyweight-bulgarian-split-squat': {
    cues: [
      'Rest the top of your back foot on a chair or couch.',
      'Keep most of your weight on the front foot.',
      'Drop straight down, torso tall, until the back knee nearly touches.',
    ],
    mistakes: [
      'Standing too close to the chair, so the front knee jams forward.',
      'Rushing the bottom instead of controlling it.',
    ],
    blurb:
      'The hardest bodyweight quad exercise here. One leg carries almost your whole weight, so it keeps working long after squats get easy.',
    freeExerciseDbId: null,
    videoId: '6Wpr0bgmKRE',
    videoStartSec: 0,
    videoChannel: 'Mind Pump',
  },
  'single-leg-romanian-deadlift': {
    cues: [
      'Stand on one leg with a soft bend in the knee.',
      'Hinge forward as your free leg reaches straight back.',
      'Keep your hips square to the floor, not rotating open.',
      'Stand up by squeezing the glute of your standing leg.',
    ],
    mistakes: ['Rounding the back to reach lower.', 'Opening the hip so the back leg turns out.'],
    blurb:
      'A bodyweight hinge that still loads the hamstrings, because one leg carries the load. Touch a wall for balance if you need to.',
    freeExerciseDbId: null,
    videoId: 'Zfr6wizR8rs',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'slider-leg-curl': {
    cues: [
      'Lie on your back with your heels on a towel or sliders.',
      'Lift your hips into a bridge and keep them up.',
      'Pull your heels toward your glutes, then slide them out slowly.',
    ],
    mistakes: [
      'Letting the hips drop as the legs straighten.',
      'Rushing the slide out, where most of the work happens.',
    ],
    blurb:
      'A leg curl with no machine: a towel on a smooth floor trains the hamstrings through knee flexion.',
    freeExerciseDbId: 'Platform_Hamstring_Slides',
    videoId: 'e17hjjvQLQQ',
    videoStartSec: 0,
    videoChannel: 'Onnit Academy',
  },
  'nordic-curl': {
    cues: [
      'Kneel with your ankles anchored under a couch or by a partner.',
      'Keep a straight line from knees to head.',
      'Lower as slowly as you can, then catch yourself with your hands.',
    ],
    mistakes: [
      'Bending at the hips to shorten the lever.',
      'Dropping fast instead of fighting the whole way down.',
    ],
    blurb:
      'One of the hardest hamstring exercises there is. Slow lowering builds strength that protects against strains; start with a few good reps.',
    freeExerciseDbId: 'Floor_Glute-Ham_Raise',
    videoId: '_e9vFU9-tkc',
    videoStartSec: 0,
    videoChannel: 'E3 Rehab',
  },
  'glute-bridge': {
    cues: [
      'Lie on your back, knees bent, feet flat near your glutes.',
      'Drive through your heels and lift your hips.',
      'Squeeze your glutes hard at the top for a second.',
    ],
    mistakes: [
      'Arching the lower back instead of extending the hips.',
      'Pushing through the toes, shifting work to the quads.',
    ],
    blurb:
      'The floor version of the hip thrust. Once 25 reps feel easy, move to the single-leg bridge.',
    freeExerciseDbId: 'Butt_Lift_Bridge',
    videoId: 'L9KZfxT654Y',
    videoStartSec: 0,
    videoChannel: 'Runna',
  },
  'single-leg-glute-bridge': {
    cues: [
      'Lift one foot and hug that knee toward your chest.',
      'Drive through the heel of the planted foot.',
      'Keep your hips level as they rise.',
    ],
    mistakes: [
      'Letting one hip drop lower than the other.',
      'Arching the lower back to get higher.',
    ],
    blurb:
      'Doubles the load on each glute without any equipment, so it is the next step after the two-leg bridge.',
    freeExerciseDbId: 'Single_Leg_Glute_Bridge',
    videoId: 'sVfp4LN9niA',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'single-leg-calf-raise': {
    cues: [
      'Stand on one foot on a step, heel hanging off.',
      'Lightly hold a wall or rail for balance only.',
      'Lower into a full stretch, then rise as high as possible.',
    ],
    mistakes: [
      'Bouncing out of the bottom instead of pausing.',
      'Pulling yourself up with the hand on the wall.',
    ],
    blurb:
      'Working one leg at a time puts your whole bodyweight on each calf, which is enough load to grow them.',
    freeExerciseDbId: null,
    videoId: 'ORT4oJ_R8Qs',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'inverted-row': {
    cues: [
      'Hang under a low bar or sturdy table, body straight.',
      'Pull your chest to the bar, elbows about 45 degrees out.',
      'Squeeze your shoulder blades together at the top.',
    ],
    mistakes: [
      'Letting the hips sag so the body forms a banana.',
      'Stopping short instead of touching chest to bar.',
    ],
    blurb:
      'The bodyweight horizontal row. Walk your feet forward to make it harder, or bend your knees to make it easier.',
    freeExerciseDbId: 'Inverted_Row',
    videoId: '5Vy6mjhXg7s',
    videoStartSec: 0,
    videoChannel: 'Danny Matranga',
  },
  'incline-push-up': {
    cues: [
      'Put your hands on a bench, table or counter edge.',
      'Keep a straight line from head to heels.',
      'Lower your chest to the edge, then press away.',
    ],
    mistakes: [
      'Letting the hips sag toward the floor.',
      'Flaring the elbows straight out to the sides.',
    ],
    blurb:
      'The push-up made easier: the higher your hands, the lighter it gets. Use it until floor push-ups hit 8 reps.',
    freeExerciseDbId: 'Incline_Push-Up',
    videoId: '0JUrOH--Kdk',
    videoStartSec: 0,
    videoChannel: 'NASM',
  },
  'decline-push-up': {
    cues: [
      'Put your feet on a bench or chair, hands on the floor.',
      'Keep your body rigid from head to heels.',
      'Lower until your chest is just above the floor.',
    ],
    mistakes: [
      'Piking the hips up to make it easier.',
      'Letting the head drop toward the floor first.',
    ],
    blurb:
      'Raising your feet shifts more of your weight onto your hands and more work onto the upper chest. It is the harder next step after push-ups.',
    freeExerciseDbId: 'Decline_Push-Up',
    videoId: 'SKPab2YC8BE',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'diamond-push-up': {
    cues: [
      'Place your hands close together under your chest.',
      'Keep your elbows tucked close to your ribs.',
      'Lower until your chest touches your hands, then press up.',
    ],
    mistakes: [
      'Flaring the elbows out, which strains the wrists and shoulders.',
      'Letting the hips sag on the way up.',
    ],
    blurb:
      'A close-hand push-up that moves the work onto the triceps, so it covers triceps training without equipment.',
    freeExerciseDbId: 'Push-Ups_-_Close_Triceps_Position',
    videoId: 'J0DnG1_S92I',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'pike-push-up': {
    cues: [
      'From a push-up, walk your feet in and lift your hips high.',
      'Lower the top of your head toward the floor between your hands.',
      'Press back up until your arms are straight.',
    ],
    mistakes: [
      'Letting the hips drop so it becomes a normal push-up.',
      'Flaring the elbows straight out to the sides.',
    ],
    blurb:
      'Overhead-press training with no weights: the more vertical your body, the harder it gets. Raise your feet to progress.',
    freeExerciseDbId: null,
    videoId: '66x0qQiJ-MA',
    videoStartSec: 0,
    videoChannel: 'Minus The Gym',
  },

  // ─── 2026-10 library expansion (plan-library-supersets.md L1) ───────────
  // Cues, mistakes and blurbs written in Chefer's own words. No photos or
  // videos yet (decision L-D5: photos wait on L-D1, videos on oEmbed
  // verification); cross-references live in
  // docs/gym/library-expansion/sources.json.
  'incline-machine-chest-press': {
    cues: [
      'Set the seat so the handles start at upper-chest height.',
      'Keep your shoulder blades pinned back against the pad.',
      'Press up and in, then lower slowly to a full stretch.',
    ],
    mistakes: [
      'Seat too low, which turns it into a shoulder press.',
      'Letting the shoulders roll forward off the pad at lockout.',
    ],
    blurb:
      'A stable, easy-to-load way to train the upper chest when the incline bench is taken or your shoulders prefer a fixed path.',
    freeExerciseDbId: 'Leverage_Incline_Chest_Press',
    videoId: 'TrTSvn5-MTk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'smith-machine-bench-press': {
    cues: [
      'Set the bench so the bar touches your lower chest.',
      'Squeeze your shoulder blades together before unracking.',
      'Lower under control and press back up the same line.',
    ],
    mistakes: [
      'Bench placed so the bar lands on your neck or belly.',
      'Bouncing the bar off your chest because the rails feel safe.',
    ],
    blurb:
      'The fixed bar path lets you push close to failure without a spotter, which makes it a solid pressing option for training alone.',
    freeExerciseDbId: 'Smith_Machine_Bench_Press',
    videoId: 'O5viuEPDXKY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'smith-machine-incline-press': {
    cues: [
      'Set the bench to 30-45 degrees under the bar path.',
      'Lower the bar to your upper chest, just below the collarbone.',
      'Keep your elbows slightly tucked as you press.',
    ],
    mistakes: [
      'Bench too steep, so the front delts take over.',
      'Bar touching your neck because the bench sits too far back.',
    ],
    blurb:
      'Upper-chest pressing on a fixed path — easy to set up, easy to progress, and safe to take close to failure alone.',
    freeExerciseDbId: 'Smith_Machine_Incline_Bench_Press',
    videoId: '8urE8Z8AMQ4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'decline-barbell-bench-press': {
    cues: [
      'Hook your legs in firmly before you unrack.',
      'Lower the bar to your lower chest with control.',
      'Press back up over your lower chest, not your face.',
    ],
    mistakes: [
      'Unracking without a spotter in an awkward head-down position.',
      'Bouncing the bar off the sternum to finish reps.',
    ],
    blurb:
      'A shorter range of motion lets most people handle more weight, and it puts a little more emphasis on the lower chest.',
    freeExerciseDbId: 'Decline_Barbell_Bench_Press',
    videoId: 'LfyQBUKR8SE',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'dumbbell-floor-press': {
    cues: [
      'Lie on the floor with knees bent and dumbbells over your chest.',
      'Lower until your upper arms rest lightly on the floor.',
      'Pause briefly, then press straight back up.',
    ],
    mistakes: [
      'Slamming the elbows into the floor instead of touching softly.',
      'Flaring the elbows straight out to the sides.',
    ],
    blurb:
      'No bench needed, and the floor caps the range — a shoulder-friendly press for home setups and sore shoulders.',
    freeExerciseDbId: 'Dumbbell_Floor_Press',
    videoId: 'uUGDRwge4F8',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'standing-cable-chest-press': {
    cues: [
      'Stagger your stance and brace before each rep.',
      'Press the handles forward and slightly together.',
      'Let the handles return slowly until your chest stretches.',
    ],
    mistakes: [
      'Leaning so far forward that your body weight does the work.',
      'Letting the cables yank your arms back between reps.',
    ],
    blurb:
      'A standing press that trains the chest with constant cable tension and makes your core work to keep you still.',
    freeExerciseDbId: 'Standing_Cable_Chest_Press',
    videoId: 'fOHouR0t9Cw',
    videoStartSec: 0,
    videoChannel: 'Mike | J2FIT Strength & Conditioning',
  },
  'pec-deck': {
    cues: [
      'Set the seat so the handles line up with mid-chest.',
      'Keep a soft, fixed bend in your elbows throughout.',
      'Squeeze the handles together and pause briefly.',
    ],
    mistakes: [
      'Letting the weight pull your arms too far back.',
      'Shrugging your shoulders up toward your ears.',
    ],
    blurb:
      'The most common chest isolation machine — a fixed arc makes it simple to learn and easy to push hard safely.',
    freeExerciseDbId: 'Butterfly',
    videoId: 'O-OBCfyh9Fw',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-crossover': {
    cues: [
      'Set the pulleys high and step forward into a split stance.',
      'Sweep your hands down and together in front of your hips.',
      'Keep your elbows softly bent and your chest up.',
    ],
    mistakes: [
      'Bending the elbows more each rep, turning it into a press.',
      'Rocking your torso forward to move the weight.',
    ],
    blurb:
      'A high-to-low cable fly that keeps tension on the chest through the whole arc, with extra emphasis on the lower fibres.',
    freeExerciseDbId: 'Cable_Crossover',
    videoId: '8Um35Es-ROE',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'low-to-high-cable-fly': {
    cues: [
      'Set the pulleys low and stand tall between them.',
      'Scoop your hands up and together to chin height.',
      'Keep your elbows softly bent and your ribs down.',
    ],
    mistakes: [
      'Lifting the hands with the shoulders instead of the chest.',
      'Arching the lower back to finish each rep.',
    ],
    blurb: 'An upward fly that biases the upper chest, a useful complement to incline pressing.',
    freeExerciseDbId: 'Low_Cable_Crossover',
    videoId: 'eQ_NBB6OBH4',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'incline-dumbbell-fly': {
    cues: [
      'Set the bench to about 30 degrees.',
      'Open your arms wide with a soft bend at the elbows.',
      'Bring the dumbbells up and together over your upper chest.',
    ],
    mistakes: [
      'Lowering so deep that the shoulders feel strained.',
      'Straightening the arms, which turns the fly into a press.',
    ],
    blurb:
      'An upper-chest fly that loads the muscle hardest at the stretch, needing only dumbbells and an adjustable bench.',
    freeExerciseDbId: 'Incline_Dumbbell_Flyes',
    videoId: '8oR5hBwbIBc',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'close-grip-lat-pulldown': {
    cues: [
      'Grip the V-handle and lean back slightly.',
      'Pull the handle to your upper chest, elbows down.',
      'Let your arms straighten fully on the way up.',
    ],
    mistakes: [
      'Leaning far back and turning it into a row.',
      'Cutting the top short and missing the lat stretch.',
    ],
    blurb:
      'A neutral-grip pulldown that many people find easier on the shoulders and stronger than the wide grip.',
    freeExerciseDbId: 'V-Bar_Pulldown',
    videoId: 'GRHLNfmr_oI',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'underhand-lat-pulldown': {
    cues: [
      'Grip the bar palms-up, about shoulder-width apart.',
      'Drive your elbows down and back toward your hips.',
      'Control the bar up until your arms are straight.',
    ],
    mistakes: [
      'Curling the bar down with the biceps instead of the back.',
      'Yanking with body swing to move heavier weight.',
    ],
    blurb:
      'A palms-up pulldown that lets the biceps help, so most people can load it heavier while still training the lats hard.',
    freeExerciseDbId: 'Underhand_Cable_Pulldowns',
    videoId: 'VprlTxpB1rk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'single-arm-lat-pulldown': {
    cues: [
      'Sit or kneel side-on with the handle overhead.',
      'Pull your elbow down to your side, chest tall.',
      'Let the arm reach fully up to stretch the lat.',
    ],
    mistakes: [
      'Twisting the torso to drag the handle down.',
      'Shortening the range as the set gets hard.',
    ],
    blurb:
      'Training one side at a time lets you get a bigger stretch and fix side-to-side differences.',
    freeExerciseDbId: 'One_Arm_Lat_Pulldown',
    videoId: 'M9xUoJYtXtc',
    videoStartSec: 0,
    videoChannel: 'Ben Yanes',
  },
  'pendlay-row': {
    cues: [
      'Hinge until your torso is close to parallel to the floor.',
      'Row the bar from the floor to your lower chest.',
      'Return the bar to the floor and reset every rep.',
    ],
    mistakes: [
      'Standing up taller each rep to cheat the weight.',
      'Rounding the lower back as you pull off the floor.',
    ],
    blurb:
      'A strict barbell row from a dead stop that removes momentum and builds raw pulling strength through the upper back.',
    freeExerciseDbId: null,
    videoId: 'Wv7f0uIKh8o',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  't-bar-row': {
    cues: [
      'Straddle the bar and hinge with a flat back.',
      'Pull the handle toward your lower chest.',
      'Lower it until your arms are straight, keeping your back set.',
    ],
    mistakes: [
      'Jerking the weight up with the legs and hips.',
      'Rounding the back to reach the bottom of each rep.',
    ],
    blurb:
      'A heavy row with a fixed pivot that is easier to balance than a barbell row and loads the whole upper back.',
    freeExerciseDbId: 'T-Bar_Row_with_Handle',
    videoId: 'yPis7nlbqdY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'machine-row': {
    cues: [
      'Set the chest pad so you can just reach the handles.',
      'Pull your elbows back and squeeze your shoulder blades.',
      'Let the handles travel forward until your back stretches.',
    ],
    mistakes: [
      'Leaning off the chest pad to heave the weight.',
      'Shrugging the shoulders up instead of pulling back.',
    ],
    blurb:
      'A supported row that lets you train the back hard without lower-back fatigue limiting the set.',
    freeExerciseDbId: 'Leverage_Iso_Row',
    videoId: 'TeFo51Q_Nsc',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'single-arm-cable-row': {
    cues: [
      'Sit tall with the handle in one hand, arm straight.',
      'Row your elbow back past your torso.',
      'Let the shoulder reach forward on the return.',
    ],
    mistakes: [
      'Rotating the torso to pull instead of using the back.',
      'Letting the stack slam between reps.',
    ],
    blurb: 'A one-arm cable row that gives a longer range of motion and evens out a weaker side.',
    freeExerciseDbId: 'Seated_One-arm_Cable_Pulley_Rows',
    videoId: 'CrylzZHfO1c',
    videoStartSec: 0,
    videoChannel: 'KAGED',
  },
  'bent-over-dumbbell-row': {
    cues: [
      'Hinge forward with a flat back, dumbbells hanging below you.',
      'Row both dumbbells toward your hips.',
      'Lower slowly until your arms are straight.',
    ],
    mistakes: [
      'Standing up as you pull, turning it into a shrug.',
      'Rounding the lower back to reach the bottom.',
    ],
    blurb:
      'The dumbbell version of the barbell row — no barbell needed, and each arm has to pull its own share.',
    freeExerciseDbId: 'Bent_Over_Two-Dumbbell_Row',
    videoId: '5PoEksoJNaw',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'band-pull-apart': {
    cues: [
      'Hold the band at shoulder height, arms straight.',
      'Pull the band apart until it touches your chest.',
      'Return slowly without letting the band snap back.',
    ],
    mistakes: [
      'Bending the elbows to make the pull easier.',
      'Shrugging your shoulders toward your ears.',
    ],
    blurb:
      'Cheap, portable rear-delt and upper-back work that fits in a warm-up or between pressing sets.',
    freeExerciseDbId: 'Band_Pull_Apart',
    videoId: 'eZwnwWMkEL4',
    videoStartSec: 0,
    videoChannel: 'Onnit',
  },
  'dumbbell-pullover': {
    cues: [
      'Lie across or along a bench with one dumbbell over your chest.',
      'Lower it behind your head with a soft elbow bend.',
      'Pull it back over your chest using your lats.',
    ],
    mistakes: [
      'Bending the elbows more, turning it into a triceps extension.',
      'Lowering further than your shoulders comfortably allow.',
    ],
    blurb:
      'A dumbbell-only way to train the lats through a long stretch without a pulldown machine.',
    freeExerciseDbId: 'Straight-Arm_Dumbbell_Pullover',
    videoId: 'jQjWlIwG4sI',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'smith-machine-shoulder-press': {
    cues: [
      'Set the seat so the bar clears your face.',
      'Lower the bar to about chin height.',
      'Press up until your arms are straight overhead.',
    ],
    mistakes: [
      'Seat too far forward, so the bar hits your face.',
      'Arching the lower back off the pad to finish reps.',
    ],
    blurb:
      'Overhead pressing on a fixed path — no balancing, so the shoulders can be pushed hard without a spotter.',
    freeExerciseDbId: 'Smith_Machine_Overhead_Shoulder_Press',
    videoId: 'OLqZDUUD2b0',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'landmine-press': {
    cues: [
      'Hold the bar end at shoulder height in one hand.',
      'Press up and forward along the bar’s natural arc.',
      'Brace your core so your torso stays square.',
    ],
    mistakes: [
      'Leaning back to turn it into an incline press.',
      'Letting the elbow flare out wide at the bottom.',
    ],
    blurb:
      'An angled press that is often comfortable for people whose shoulders dislike strict overhead pressing.',
    freeExerciseDbId: null,
    videoId: 'SmEm6HGLin4',
    videoStartSec: 0,
    videoChannel: 'Muscle & Motion',
  },
  'standing-dumbbell-shoulder-press': {
    cues: [
      'Stand tall with dumbbells at shoulder height.',
      'Squeeze your glutes and brace before each press.',
      'Press up until your arms are straight overhead.',
    ],
    mistakes: [
      'Leaning back and turning it into a standing incline press.',
      'Using a leg drive to push the weights up.',
    ],
    blurb:
      'Standing makes the core work to hold you still, and dumbbells let each shoulder move freely.',
    freeExerciseDbId: 'Standing_Dumbbell_Press',
    videoId: 'XBOODv-Y6dc',
    videoStartSec: 0,
    videoChannel: 'Tim Bullici',
  },
  'arnold-press': {
    cues: [
      'Start with dumbbells at your chin, palms facing you.',
      'Rotate your palms forward as you press up.',
      'Reverse the rotation smoothly on the way down.',
    ],
    mistakes: [
      'Rushing the rotation and losing control of the dumbbells.',
      'Arching your back to finish the press.',
    ],
    blurb:
      'A rotating dumbbell press that covers a longer range than a standard press and hits the front delts hard.',
    freeExerciseDbId: 'Arnold_Dumbbell_Press',
    videoId: 'jeJttN2EWCo',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'machine-shoulder-press': {
    cues: [
      'Set the seat so the handles start at shoulder height.',
      'Keep your back flat against the pad.',
      'Press up and lower slowly to the start position.',
    ],
    mistakes: [
      'Seat too high, which shortens the range at the bottom.',
      'Arching the lower back off the pad.',
    ],
    blurb:
      'A stable, beginner-friendly overhead press that is easy to load and safe to push near failure.',
    freeExerciseDbId: 'Machine_Shoulder_Military_Press',
    videoId: 'WvLMauqrnK8',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'kettlebell-press': {
    cues: [
      'Hold the bell in the rack position against your forearm.',
      'Brace your core and press straight overhead.',
      'Lower under control back to the rack position.',
    ],
    mistakes: [
      'Leaning sideways to get the bell overhead.',
      'Letting the wrist bend back under the bell.',
    ],
    blurb:
      'A one-arm overhead press that also trains core stability, needing only a single kettlebell.',
    freeExerciseDbId: null,
    videoId: 'gjr-QAdsq4o',
    videoStartSec: 0,
    videoChannel: 'Onnit',
  },
  'machine-lateral-raise': {
    cues: [
      'Line your shoulders up with the machine’s pivot points.',
      'Raise your arms out to the side to shoulder height.',
      'Lower slowly to keep tension on the side delts.',
    ],
    mistakes: [
      'Shrugging the shoulders up to move the pads.',
      'Dropping the weight fast instead of lowering it.',
    ],
    blurb:
      'A fixed-path lateral raise that keeps tension on the side delts and is easy to progress in small steps.',
    freeExerciseDbId: null,
    videoId: '0o07iGKUarI',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'band-lateral-raise': {
    cues: [
      'Stand on the band and hold an end in each hand.',
      'Raise your arms out to the side to shoulder height.',
      'Lower slowly against the band’s pull.',
    ],
    mistakes: [
      'Swinging the body to get the band moving.',
      'Raising the hands above shoulder height and shrugging.',
    ],
    blurb:
      'A portable side-delt exercise for home or travel — the band gets harder exactly where dumbbells get easy.',
    freeExerciseDbId: 'Lateral_Raise_-_With_Bands',
    videoId: 'gfEyrmxbCbw',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'upright-row': {
    cues: [
      'Grip the bar about shoulder-width or slightly wider.',
      'Lead with your elbows and pull to lower-chest height.',
      'Lower the bar under control to full arm extension.',
    ],
    mistakes: [
      'Using a very narrow grip, which can irritate the shoulders.',
      'Pulling the bar above the chest and pinching the shoulders.',
    ],
    blurb:
      'A compound pull for the side delts and traps; a wider grip and chest-high finish keep it shoulder-friendly.',
    freeExerciseDbId: 'Upright_Barbell_Row',
    videoId: 'um3VVzqunPU',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'dumbbell-front-raise': {
    cues: [
      'Hold the dumbbells in front of your thighs.',
      'Raise them forward to shoulder height, arms nearly straight.',
      'Lower slowly without letting them swing.',
    ],
    mistakes: [
      'Swinging the torso to throw the weights up.',
      'Raising far above shoulder height and shrugging.',
    ],
    blurb:
      'Direct front-delt work for people who want more than pressing gives — usually needed in small doses.',
    freeExerciseDbId: 'Front_Dumbbell_Raise',
    videoId: 'hRJ6tR5-if0',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'cable-rear-delt-fly': {
    cues: [
      'Set the pulleys at shoulder height and cross the cables.',
      'Pull your arms out wide with a soft elbow bend.',
      'Return slowly until your hands cross again.',
    ],
    mistakes: [
      'Pulling the elbows back like a row instead of out wide.',
      'Using so much weight that the upper traps take over.',
    ],
    blurb: 'Constant cable tension makes this one of the best ways to isolate the rear delts.',
    freeExerciseDbId: 'Cable_Rear_Delt_Fly',
    videoId: 'er15V96hG5U',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'dumbbell-external-rotation': {
    cues: [
      'Lie on your side with a rolled towel under the elbow.',
      'Keep the elbow pinned and rotate the forearm upward.',
      'Lower slowly back to your stomach.',
    ],
    mistakes: [
      'Letting the elbow lift off your side.',
      'Going too heavy and twisting the torso to move it.',
    ],
    blurb:
      'Light, direct rotator-cuff work that keeps the shoulders healthy alongside heavy pressing.',
    freeExerciseDbId: 'External_Rotation',
    videoId: 'YvNMmBZ-8dY',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'band-external-rotation': {
    cues: [
      'Anchor the band at elbow height and stand side-on.',
      'Keep the elbow at your side, bent to 90 degrees.',
      'Rotate your forearm outward, then return slowly.',
    ],
    mistakes: [
      'Letting the elbow drift away from your body.',
      'Rotating the torso instead of the shoulder.',
    ],
    blurb: 'A band version of rotator-cuff work that fits easily into a warm-up.',
    freeExerciseDbId: 'External_Rotation_with_Band',
    videoId: '4fM554Org3o',
    videoStartSec: 0,
    videoChannel: 'Onyx Physical Therapy and Wellness',
  },
  'ez-bar-curl': {
    cues: [
      'Grip the angled handles about shoulder-width apart.',
      'Keep your elbows at your sides as you curl.',
      'Lower all the way until your arms are straight.',
    ],
    mistakes: [
      'Swinging the torso to get the bar moving.',
      'Letting the elbows drift forward at the top.',
    ],
    blurb:
      'The angled grip is easier on the wrists than a straight bar, so most people can curl heavy and comfortably.',
    freeExerciseDbId: 'EZ-Bar_Curl',
    videoId: 'EK747VC37yE',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'zottman-curl': {
    cues: [
      'Curl the dumbbells up with palms facing up.',
      'Rotate your palms down at the top.',
      'Lower slowly with palms down, then rotate back.',
    ],
    mistakes: [
      'Lowering too fast and wasting the hard part.',
      'Swinging the weights up with the hips.',
    ],
    blurb:
      'Combines a regular curl with a slow reverse-grip lowering, training the biceps and forearms together.',
    freeExerciseDbId: 'Zottman_Curl',
    videoId: 'FSGDM9-dZ9w',
    videoStartSec: 0,
    videoChannel: 'Bodybuilding.com',
  },
  'concentration-curl': {
    cues: [
      'Sit and brace your elbow against your inner thigh.',
      'Curl the dumbbell toward your shoulder.',
      'Lower slowly until your arm is fully straight.',
    ],
    mistakes: [
      'Lifting the elbow off the thigh to help the curl.',
      'Cutting the bottom short and missing the stretch.',
    ],
    blurb:
      'A strict, braced curl that removes all cheating — useful for focusing on the biceps with lighter weights.',
    freeExerciseDbId: 'Concentration_Curls',
    videoId: 'Jvj2wV0vOYU',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'dumbbell-preacher-curl': {
    cues: [
      'Rest the back of your upper arm flat on the pad.',
      'Curl the dumbbell up without lifting the elbow.',
      'Lower slowly until your arm is nearly straight.',
    ],
    mistakes: [
      'Dropping fast to the bottom and jarring the elbow.',
      'Lifting the shoulder to help the weight up.',
    ],
    blurb:
      'A one-arm preacher curl that trains each side separately and loads the biceps hard in the stretched position.',
    freeExerciseDbId: 'One_Arm_Dumbbell_Preacher_Curl',
    videoId: 'fuK3nFvwgXk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'spider-curl': {
    cues: [
      'Lie chest-down on an incline bench, arms hanging.',
      'Curl the bar up without moving your upper arms.',
      'Lower until your arms are straight below you.',
    ],
    mistakes: [
      'Swinging the elbows forward to finish the curl.',
      'Lifting the chest off the bench.',
    ],
    blurb: 'Hanging arms keep tension on the biceps at the top, where most curls get easy.',
    freeExerciseDbId: 'Spider_Curl',
    videoId: 'WG3vdcq__I0',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'machine-biceps-curl': {
    cues: [
      'Line your elbows up with the machine’s pivot.',
      'Curl the handles up and squeeze briefly.',
      'Lower slowly until your arms are nearly straight.',
    ],
    mistakes: ['Lifting the elbows off the pad.', 'Using momentum instead of a controlled curl.'],
    blurb:
      'A fixed-path curl that is easy to learn and lets you push the biceps hard without cheating.',
    freeExerciseDbId: 'Machine_Bicep_Curl',
    videoId: 'AR-oARBkYxI',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'cable-rope-hammer-curl': {
    cues: [
      'Grip the rope with palms facing each other.',
      'Keep your elbows at your sides as you curl.',
      'Lower slowly until your arms are straight.',
    ],
    mistakes: ['Leaning back to move more weight.', 'Letting the elbows drift forward.'],
    blurb:
      'A hammer curl with constant cable tension that trains the biceps and forearms together.',
    freeExerciseDbId: 'Cable_Hammer_Curls_-_Rope_Attachment',
    videoId: '1Quc_tOv97I',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'rope-triceps-pushdown': {
    cues: [
      'Keep your elbows pinned at your sides.',
      'Push down and spread the rope ends apart at the bottom.',
      'Let your forearms rise to just above parallel.',
    ],
    mistakes: [
      'Letting the elbows drift forward and back.',
      'Leaning over the rope to push with body weight.',
    ],
    blurb:
      'The rope lets your hands spread at the bottom for a full triceps squeeze — the most common pushdown variation.',
    freeExerciseDbId: 'Triceps_Pushdown_-_Rope_Attachment',
    videoId: '-xa-6cQaZKY',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'triceps-dip': {
    cues: [
      'Stay upright on the bars with your elbows close.',
      'Lower until your upper arms are about parallel to the floor.',
      'Press back up until your arms are straight.',
    ],
    mistakes: [
      'Dropping too deep and straining the front of the shoulders.',
      'Flaring the elbows wide.',
    ],
    blurb:
      'An upright dip that shifts the work toward the triceps — one of the best bodyweight triceps builders.',
    freeExerciseDbId: 'Dips_-_Triceps_Version',
    videoId: '4LA1kF7yCGo',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'assisted-dip': {
    cues: [
      'Pick an assistance level that allows full, controlled reps.',
      'Lower until your upper arms are about parallel.',
      'Press up until your arms are straight.',
    ],
    mistakes: ['Using so much assistance the set never gets hard.', 'Cutting the depth short.'],
    blurb: 'Lets you practise and build strength for full dips with less than your body weight.',
    freeExerciseDbId: null,
    videoId: 'yZ83t4mrPrI',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'seated-dip-machine': {
    cues: [
      'Sit tall and grip the handles beside your hips.',
      'Press down until your arms are straight.',
      'Let the handles rise slowly to the start.',
    ],
    mistakes: [
      'Leaning forward to use the chest and shoulders.',
      'Letting the stack bang between reps.',
    ],
    blurb:
      'A seated, fixed-path dip that loads the triceps heavily without needing to lift your full body weight.',
    freeExerciseDbId: 'Dip_Machine',
    videoId: 'pMarNxAvHPc',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'reverse-curl': {
    cues: [
      'Grip the bar palms-down, shoulder-width apart.',
      'Curl it up keeping your wrists straight.',
      'Lower slowly until your arms are straight.',
    ],
    mistakes: [
      'Letting the wrists bend back under the bar.',
      'Swinging the hips to start the curl.',
    ],
    blurb:
      'A palms-down curl that builds the forearms and the brachialis, the muscle under the biceps.',
    freeExerciseDbId: 'Reverse_Barbell_Curl',
    videoId: 'SQOsKWSHTMo',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'barbell-wrist-curl': {
    cues: [
      'Sit with forearms on your thighs, wrists past the knees.',
      'Let the bar roll down toward your fingertips.',
      'Curl your wrists up as high as they go.',
    ],
    mistakes: [
      'Lifting the forearms off the thighs to move the bar.',
      'Using short, bouncy reps instead of the full range.',
    ],
    blurb:
      'Direct forearm work for grip strength and forearm size, which pulling alone rarely maxes out.',
    freeExerciseDbId: 'Seated_Palm-Up_Barbell_Wrist_Curl',
    videoId: 'lfQR7oVS8eo',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'smith-machine-squat': {
    cues: [
      'Set your feet slightly in front of the bar.',
      'Sit down between your heels to a comfortable depth.',
      'Drive up through your whole foot.',
    ],
    mistakes: [
      'Feet directly under the bar, forcing you onto your toes.',
      'Cutting depth short because the bar feels locked in.',
    ],
    blurb:
      'A squat with no balancing needed — good for loading the quads hard when training alone.',
    freeExerciseDbId: 'Smith_Machine_Squat',
    videoId: 'AHnX-aimA4E',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'pendulum-squat': {
    cues: [
      'Set your back flat against the pad and feet mid-platform.',
      'Lower slowly until your knees are fully bent.',
      'Drive up without locking the knees hard at the top.',
    ],
    mistakes: [
      'Cutting the depth short to move more weight.',
      'Letting the hips lift off the pad.',
    ],
    blurb: 'A machine squat with a deep, quad-focused arc that is easy on the lower back.',
    freeExerciseDbId: null,
    videoId: 'lYoYwBYU3tQ',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'belt-squat': {
    cues: [
      'Attach the belt low on your hips, not your waist.',
      'Squat down with an upright torso.',
      'Drive up through your whole foot.',
    ],
    mistakes: ['Leaning forward and turning it into a hinge.', 'Letting the knees cave inward.'],
    blurb:
      'Loads the legs from the hips, so you can train squats hard with almost no lower-back or spinal load.',
    freeExerciseDbId: null,
    videoId: 'V0bPCIjJA7U',
    videoStartSec: 0,
    videoChannel: 'Heavyset Gym',
  },
  'dumbbell-sumo-squat': {
    cues: [
      'Take a wide stance with toes turned out.',
      'Hold one dumbbell between your legs.',
      'Sit straight down, knees tracking over your toes.',
    ],
    mistakes: [
      'Letting the knees collapse inward.',
      'Leaning forward so the dumbbell pulls you over.',
    ],
    blurb: 'A wide-stance squat that adds inner-thigh work and needs just one dumbbell.',
    freeExerciseDbId: 'Plie_Dumbbell_Squat',
    videoId: 'MwNY25e4QEA',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'kettlebell-goblet-squat': {
    cues: [
      'Hold the kettlebell by the horns at your chest.',
      'Sit down between your heels with your chest up.',
      'Drive up through your whole foot.',
    ],
    mistakes: [
      'Letting the chest drop and the bell pull you forward.',
      'Rising onto your toes at the bottom.',
    ],
    blurb:
      'The kettlebell version of the goblet squat — a simple, self-correcting squat for home and beginners.',
    freeExerciseDbId: 'Goblet_Squat',
    videoId: 'MWHIs0zxkCU',
    videoStartSec: 0,
    videoChannel: 'National Academy of Sports Medicine (NASM)',
  },
  'good-morning': {
    cues: [
      'Rest the bar on your upper back, knees soft.',
      'Push your hips back with a flat back.',
      'Stop when you feel the hamstrings stretch, then stand up.',
    ],
    mistakes: [
      'Rounding the lower back to go deeper.',
      'Using heavy weight before the movement feels solid.',
    ],
    blurb:
      'A barbell hinge that trains the hamstrings and lower back; start light and earn the load.',
    freeExerciseDbId: 'Good_Morning',
    videoId: 'dEJ0FTm-CEk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'sumo-deadlift': {
    cues: [
      'Take a wide stance and grip the bar inside your knees.',
      'Push your knees out and keep your chest up.',
      'Push the floor away until you stand tall.',
    ],
    mistakes: [
      'Letting the hips shoot up before the bar leaves the floor.',
      'Letting the knees cave in during the pull.',
    ],
    blurb:
      'A wide-stance deadlift with a more upright torso, which some lifters find stronger and kinder to the back.',
    freeExerciseDbId: 'Sumo_Deadlift',
    videoId: 'pfSMst14EFk',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'trap-bar-deadlift': {
    cues: [
      'Stand in the middle of the bar, grip the handles.',
      'Sit your hips down and brace with a flat back.',
      'Drive the floor away and stand tall.',
    ],
    mistakes: [
      'Squatting too low so it becomes a squat with handles.',
      'Rounding the back off the floor.',
    ],
    blurb:
      'The easiest deadlift to learn — the load sits beside you, so the back stays more upright and the legs share the work.',
    freeExerciseDbId: 'Trap_Bar_Deadlift',
    videoId: 'v709aJKv-gM',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'rack-pull': {
    cues: [
      'Set the bar at or just below knee height.',
      'Brace hard and keep the bar close to your legs.',
      'Stand tall and squeeze your glutes at the top.',
    ],
    mistakes: [
      'Leaning back excessively at lockout.',
      'Jerking the bar off the pins with a rounded back.',
    ],
    blurb:
      'A partial deadlift that overloads the top half of the pull and builds the upper back and grip.',
    freeExerciseDbId: 'Rack_Pulls',
    videoId: '9vYBWV5OeKg',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'kettlebell-swing': {
    cues: [
      'Hike the bell back between your legs like a pass.',
      'Snap your hips forward to float the bell to chest height.',
      'Let it fall back and hinge again.',
    ],
    mistakes: [
      'Squatting the swing instead of hinging at the hips.',
      'Lifting the bell with the arms.',
    ],
    blurb:
      'A powerful hip hinge that trains the glutes and hamstrings and raises your heart rate at the same time.',
    freeExerciseDbId: null,
    videoId: 'LBhaLLc153A',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'kettlebell-deadlift': {
    cues: [
      'Stand with the kettlebell between your feet.',
      'Hinge down with a flat back and grip the handle.',
      'Stand up by driving your hips forward.',
    ],
    mistakes: [
      'Rounding the back to reach the bell.',
      'Squatting down instead of pushing the hips back.',
    ],
    blurb:
      'The simplest way to learn the hip hinge before moving on to swings or barbell deadlifts.',
    freeExerciseDbId: null,
    videoId: 'l6gDwf3xC6s',
    videoStartSec: 0,
    videoChannel: 'Onnit',
  },
  'kettlebell-single-leg-deadlift': {
    cues: [
      'Hold the bell in the hand opposite your standing leg.',
      'Hinge forward as the free leg reaches back.',
      'Keep your hips square and stand back up.',
    ],
    mistakes: ['Opening the hips toward the ceiling.', 'Rounding the back to reach lower.'],
    blurb:
      'A one-leg hinge that trains the hamstrings and glutes along with balance and hip control.',
    freeExerciseDbId: 'Kettlebell_One-Legged_Deadlift',
    videoId: 'b9bHy3ojQWA',
    videoStartSec: 0,
    videoChannel: 'Purple Patch Fitness',
  },
  'dumbbell-reverse-lunge': {
    cues: [
      'Step back and lower your back knee toward the floor.',
      'Keep most of your weight on the front foot.',
      'Push through the front heel to stand back up.',
    ],
    mistakes: [
      'Taking too short a step, so the front knee jams forward.',
      'Leaning far forward over the front leg.',
    ],
    blurb: 'A knee-friendly lunge — stepping back is easier to control than stepping forward.',
    freeExerciseDbId: 'Dumbbell_Rear_Lunge',
    videoId: 'QwcBZLq7Jkw',
    videoStartSec: 0,
    videoChannel: 'Mike | J2FIT Strength & Conditioning',
  },
  'dumbbell-step-up': {
    cues: [
      'Place your whole foot on a knee-height box.',
      'Drive through that foot to stand on the box.',
      'Step down slowly with control.',
    ],
    mistakes: ['Pushing off the back foot to help.', 'Using a box so high the hips have to twist.'],
    blurb:
      'A single-leg exercise that builds the quads and glutes and transfers directly to stairs and hills.',
    freeExerciseDbId: 'Dumbbell_Step_Ups',
    videoId: 'DxUNi119Qzs',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'barbell-lunge': {
    cues: [
      'Brace with the bar on your upper back.',
      'Step out and lower your back knee toward the floor.',
      'Drive up through the front foot.',
    ],
    mistakes: [
      'Stepping in a straight line and losing balance.',
      'Letting the front knee collapse inward.',
    ],
    blurb: 'A heavier lunge option once dumbbells become too heavy to hold.',
    freeExerciseDbId: 'Barbell_Lunge',
    videoId: 'NcDtORTfVNQ',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'standing-leg-curl': {
    cues: [
      'Line your knee up with the machine’s pivot.',
      'Curl your heel toward your glutes.',
      'Lower slowly until your leg is nearly straight.',
    ],
    mistakes: ['Lifting the hip to swing the weight up.', 'Dropping the weight on the way down.'],
    blurb: 'A one-leg curl that trains each hamstring separately and evens out imbalances.',
    freeExerciseDbId: 'Standing_Leg_Curl',
    videoId: 'Z053-kKjesQ',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'barbell-glute-bridge': {
    cues: [
      'Lie on the floor with the padded bar over your hips.',
      'Drive through your heels and lift your hips.',
      'Squeeze your glutes at the top, ribs down.',
    ],
    mistakes: [
      'Arching the lower back at the top.',
      'Pushing through the toes instead of the heels.',
    ],
    blurb:
      'A floor-based hip thrust with a shorter range that is quick to set up and easy to load heavy.',
    freeExerciseDbId: 'Barbell_Glute_Bridge',
    videoId: 'ylpfCk3i-0Y',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'cable-glute-kickback': {
    cues: [
      'Attach an ankle cuff and hinge slightly forward.',
      'Kick the leg back by squeezing the glute.',
      'Return slowly without letting the weight stack touch.',
    ],
    mistakes: ['Arching the lower back to kick higher.', 'Swinging the leg with momentum.'],
    blurb: 'Isolates the glutes one side at a time with constant cable tension.',
    freeExerciseDbId: 'One-Legged_Cable_Kickback',
    videoId: '5jJNfIlKTmg',
    videoStartSec: 0,
    videoChannel: 'Colossus Fitness',
  },
  'glute-kickback-machine': {
    cues: [
      'Set the pad against the back of your working leg.',
      'Push back until your hip is fully extended.',
      'Return slowly with control.',
    ],
    mistakes: ['Overarching the lower back at the end.', 'Using momentum to throw the pad back.'],
    blurb: 'A fixed-path glute isolation exercise that is easy to load and progress.',
    freeExerciseDbId: null,
    videoId: 'NLDBFtSNhqg',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'leg-press-calf-raise': {
    cues: [
      'Place the balls of your feet on the bottom edge.',
      'Let your heels drop for a full stretch.',
      'Press up onto your toes and pause.',
    ],
    mistakes: ['Bending the knees to help.', 'Bouncing at the bottom instead of pausing.'],
    blurb: 'A calf raise on the leg press — easy to load heavy without a dedicated calf machine.',
    freeExerciseDbId: 'Calf_Press_On_The_Leg_Press_Machine',
    videoId: 'KxEYX_cuesM',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'hanging-leg-raise': {
    cues: [
      'Hang from the bar with your shoulders engaged.',
      'Raise your straight legs to hip height or higher.',
      'Lower slowly without swinging.',
    ],
    mistakes: ['Swinging to get the legs up.', 'Arching the lower back on the way down.'],
    blurb:
      'A harder progression of the hanging knee raise that trains the abs through a long range.',
    freeExerciseDbId: 'Hanging_Leg_Raise',
    videoId: '7FwGZ8qY5OU',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'captains-chair-knee-raise': {
    cues: [
      'Rest your forearms on the pads, back against the support.',
      'Raise your knees toward your chest.',
      'Curl your pelvis up at the top, then lower slowly.',
    ],
    mistakes: ['Swinging the legs up with momentum.', 'Only lifting the knees to hip height.'],
    blurb: 'A supported knee raise that removes grip and swing, so the abs do the work.',
    freeExerciseDbId: 'Knee_Hip_Raise_On_Parallel_Bars',
    videoId: '7KDDZtaUaxw',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'ab-crunch-machine': {
    cues: [
      'Set the seat so the pads sit on your chest or shoulders.',
      'Curl your ribs toward your hips.',
      'Return slowly without letting the stack touch.',
    ],
    mistakes: [
      'Pulling with your arms instead of your abs.',
      'Using momentum to bounce through reps.',
    ],
    blurb: 'Loaded ab work that progresses in steady weight steps.',
    freeExerciseDbId: 'Ab_Crunch_Machine',
    videoId: '-OUSBPnHvsQ',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  crunch: {
    cues: [
      'Lie on your back with knees bent and feet flat.',
      'Curl your shoulders off the floor toward your hips.',
      'Lower slowly back to the floor.',
    ],
    mistakes: [
      'Pulling on your neck with your hands.',
      'Sitting all the way up and using the hip flexors.',
    ],
    blurb: 'The simplest ab exercise — no equipment and easy to learn.',
    freeExerciseDbId: 'Crunches',
    videoId: 'NGRKFMKhF8s',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'reverse-crunch': {
    cues: [
      'Lie on your back with knees bent at 90 degrees.',
      'Curl your hips off the floor toward your chest.',
      'Lower slowly until your hips touch the floor.',
    ],
    mistakes: ['Swinging the legs to lift the hips.', 'Letting the lower back arch as you lower.'],
    blurb: 'A lower-ab focused crunch that is easier on the neck than a regular crunch.',
    freeExerciseDbId: 'Reverse_Crunch',
    videoId: 'fhrkw1aaP8k',
    videoStartSec: 0,
    videoChannel: 'ATHLEAN-X™',
  },
  'lying-leg-raise': {
    cues: [
      'Lie flat and press your lower back into the floor.',
      'Raise straight legs until they point at the ceiling.',
      'Lower slowly without letting your back arch.',
    ],
    mistakes: ['Letting the lower back lift off the floor.', 'Dropping the legs fast.'],
    blurb: 'A floor ab exercise that builds toward hanging leg raises.',
    freeExerciseDbId: 'Flat_Bench_Lying_Leg_Raise',
    videoId: 'xJJu-WiROM8',
    videoStartSec: 0,
    videoChannel: 'Dimitri Giankoulas',
  },
  'side-plank': {
    cues: [
      'Stack your elbow under your shoulder.',
      'Lift your hips to make a straight line.',
      'Hold without letting the hips sag.',
    ],
    mistakes: ['Letting the hips drop toward the floor.', 'Rolling the chest forward or backward.'],
    blurb: 'Trains the obliques to resist sideways bending — a core job planks and crunches miss.',
    freeExerciseDbId: 'Side_Bridge',
    videoId: 'Oe9Tp9SvTCE',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'hollow-body-hold': {
    cues: [
      'Press your lower back into the floor.',
      'Lift your shoulders and legs a few inches up.',
      'Hold with your arms reaching past your head.',
    ],
    mistakes: [
      'Letting the lower back arch off the floor.',
      'Holding the breath instead of breathing steadily.',
    ],
    blurb:
      'A demanding hold that builds the core tension used in pull-ups and many bodyweight moves.',
    freeExerciseDbId: null,
    videoId: 'qcwAB98I2Gc',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'dead-bug': {
    cues: [
      'Lie on your back with arms and knees raised.',
      'Lower the opposite arm and leg toward the floor.',
      'Keep your lower back pressed down throughout.',
    ],
    mistakes: [
      'Letting the lower back arch as the limbs lower.',
      'Moving too fast to stay in control.',
    ],
    blurb:
      'A beginner-friendly core exercise that teaches you to brace while your arms and legs move.',
    freeExerciseDbId: 'Dead_Bug',
    videoId: '4XLEnwUr1d8',
    videoStartSec: 0,
    videoChannel: 'Bodybuilding.com',
  },
  'bird-dog': {
    cues: [
      'Start on hands and knees, back flat.',
      'Reach one arm forward and the opposite leg back.',
      'Pause, return, and switch sides.',
    ],
    mistakes: [
      'Twisting the hips as the leg rises.',
      'Arching the lower back to lift the leg higher.',
    ],
    blurb: 'A gentle core and lower-back exercise that trains stability without loading the spine.',
    freeExerciseDbId: null,
    videoId: 'ZdAHe9_HeEw',
    videoStartSec: 0,
    videoChannel: 'National Academy of Sports Medicine (NASM)',
  },
  'cable-woodchop': {
    cues: [
      'Set the pulley high and stand side-on.',
      'Pull the handle diagonally across your body to the opposite hip.',
      'Rotate through your hips and torso together.',
    ],
    mistakes: ['Pulling only with the arms.', 'Twisting from the lower back alone.'],
    blurb: 'A rotational core exercise that trains the obliques to produce and control twisting.',
    freeExerciseDbId: 'Standing_Cable_Wood_Chop',
    videoId: 'pAplQXk3dkU',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'barbell-shrug': {
    cues: [
      'Hold the bar at arm’s length in front of you.',
      'Shrug your shoulders straight up toward your ears.',
      'Pause at the top, then lower slowly.',
    ],
    mistakes: ['Rolling the shoulders in circles.', 'Bending the elbows to help lift.'],
    blurb: 'Heavy, direct trap work that is easy to load.',
    freeExerciseDbId: 'Barbell_Shrug',
    videoId: 'M_MjF5Nm_h4',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'suitcase-carry': {
    cues: [
      'Hold one dumbbell at your side.',
      'Walk tall without leaning toward the weight.',
      'Switch hands halfway through the set.',
    ],
    mistakes: ['Leaning toward the weight.', 'Shrugging the loaded shoulder up.'],
    blurb: 'A one-sided carry that trains the obliques to keep you upright, along with grip.',
    freeExerciseDbId: null,
    videoId: 'tNHdx7pmrGI',
    videoStartSec: 0,
    videoChannel: 'Buff Dudes Workouts',
  },
  'band-lateral-walk': {
    cues: [
      'Place the band around your knees or ankles.',
      'Sit into a quarter squat and step sideways.',
      'Keep tension on the band the whole time.',
    ],
    mistakes: [
      'Letting the feet come together and the band go slack.',
      'Standing up tall instead of staying in a squat.',
    ],
    blurb: 'A warm-up favourite that wakes up the side glutes and abductors.',
    freeExerciseDbId: 'Monster_Walk',
    videoId: 'DkaQ1mmfErA',
    videoStartSec: 0,
    videoChannel: 'Seriously Strong Training',
  },
  'hip-adduction-machine': {
    cues: [
      'Set the pads on the inside of your knees.',
      'Squeeze your legs together and pause briefly.',
      'Let the pads open slowly to a comfortable stretch.',
    ],
    mistakes: ['Letting the weight snap the legs open.', 'Setting a range too wide for your hips.'],
    blurb: 'Direct inner-thigh work that compound lifts only partly cover.',
    freeExerciseDbId: 'Thigh_Adductor',
    videoId: 'CjAVezAggkI',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'dumbbell-triceps-kickback': {
    cues: [
      'Hinge forward and pin your upper arm to your side.',
      'Straighten your elbow until your arm is fully extended.',
      'Lower slowly without moving the upper arm.',
    ],
    mistakes: [
      'Letting the upper arm swing.',
      'Using a weight too heavy to fully straighten the arm.',
    ],
    blurb: 'Triceps isolation with just one dumbbell, hardest at full lockout.',
    freeExerciseDbId: 'Tricep_Dumbbell_Kickback',
    videoId: '6SS6K3lAwZ8',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'pistol-squat': {
    cues: [
      'Stand on one leg with the other leg out in front.',
      'Sit down slowly while keeping your heel down.',
      'Drive up through the standing foot.',
    ],
    mistakes: ['Letting the knee cave inward.', 'Falling into the bottom without control.'],
    blurb: 'An advanced single-leg squat that builds serious leg strength with no equipment.',
    freeExerciseDbId: null,
    videoId: 'vq5-vdgJc0I',
    videoStartSec: 0,
    videoChannel: 'Squat University',
  },
  'wall-sit': {
    cues: [
      'Slide down the wall until your knees are about 90 degrees.',
      'Keep your back flat against the wall.',
      'Hold with your weight through your heels.',
    ],
    mistakes: ['Resting your hands on your thighs.', 'Letting the hips sit higher than the knees.'],
    blurb: 'A simple isometric hold that builds quad endurance with nothing but a wall.',
    freeExerciseDbId: null,
    videoId: 'y-wV4Venusw',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },
  'lateral-lunge': {
    cues: [
      'Take a wide step to the side.',
      'Sit back into that hip, keeping the other leg straight.',
      'Push off the bent leg to return.',
    ],
    mistakes: ['Letting the knee cave inward.', 'Rounding the back to get lower.'],
    blurb: 'Trains the legs side-to-side, including the inner thighs, which most leg work misses.',
    freeExerciseDbId: null,
    videoId: 'liFeq7swKfc',
    videoStartSec: 0,
    videoChannel: 'Mind Pump TV',
  },
  'step-up': {
    cues: [
      'Place your whole foot on a sturdy step or box.',
      'Drive through that foot to stand up.',
      'Lower slowly back down.',
    ],
    mistakes: ['Pushing off the back foot.', 'Using a box too high to control.'],
    blurb: 'A beginner-friendly single-leg exercise that needs only a step or sturdy box.',
    freeExerciseDbId: null,
    videoId: 'WCFCdxzFBa4',
    videoStartSec: 0,
    videoChannel: 'Get Exercise Confident',
  },
  'glute-ham-raise': {
    cues: [
      'Lock your feet in and set your knees on the pad.',
      'Lower your body forward with control.',
      'Pull yourself back up using your hamstrings.',
    ],
    mistakes: ['Bending at the hips instead of the knees.', 'Dropping too fast on the way down.'],
    blurb: 'One of the hardest hamstring exercises — trains them at both the knee and the hip.',
    freeExerciseDbId: 'Glute_Ham_Raise',
    videoId: 'SBGYSfoqyfU',
    videoStartSec: 0,
    videoChannel: 'Renaissance Periodization',
  },
  'donkey-kick': {
    cues: [
      'Start on hands and knees, back flat.',
      'Push one foot up toward the ceiling, knee bent.',
      'Squeeze your glute at the top, then lower.',
    ],
    mistakes: ['Arching the lower back to kick higher.', 'Rushing through reps.'],
    blurb: 'A no-equipment glute exercise that is easy to learn and fits in anywhere.',
    freeExerciseDbId: 'Glute_Kickback',
    videoId: 'EtSJ8rwm5M8',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  clamshell: {
    cues: [
      'Lie on your side with knees bent and feet together.',
      'Lift your top knee without moving your feet.',
      'Lower slowly back down.',
    ],
    mistakes: ['Rolling the hips backward to lift higher.', 'Moving too fast.'],
    blurb: 'A simple side-glute exercise — add a band around the knees to make it harder.',
    freeExerciseDbId: null,
    videoId: 'gFyIjunfbbg',
    videoStartSec: 0,
    videoChannel: 'Hinge Health',
  },
  'kneeling-push-up': {
    cues: [
      'Kneel with hands under your shoulders.',
      'Keep a straight line from your knees to your head.',
      'Lower your chest to the floor and press back up.',
    ],
    mistakes: ['Letting the hips pike up.', 'Flaring the elbows straight out.'],
    blurb: 'The standard push-up regression — builds strength toward a full push-up.',
    freeExerciseDbId: null,
    videoId: 'rR1efh-33AQ',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'bench-dip': {
    cues: [
      'Sit on a bench edge, hands beside your hips.',
      'Slide forward and lower until your elbows reach 90 degrees.',
      'Press back up until your arms are straight.',
    ],
    mistakes: [
      'Lowering too deep and straining the shoulders.',
      'Letting the hips drift far from the bench.',
    ],
    blurb: 'A home-friendly triceps exercise that needs only a bench or sturdy chair.',
    freeExerciseDbId: 'Bench_Dips',
    videoId: 'c3ZGl4pAwZ4',
    videoStartSec: 0,
    videoChannel: 'ScottHermanFitness',
  },

  // ─── Cardio (T-42.1, 06 §6) — no vendored photo/video yet; content is
  // Chefer's own copy, cues drawn from the research doc's form/safety cue. ──
  'treadmill-walk': {
    cues: [
      'Land midfoot under your hips, not out in front of you.',
      'Keep a tall posture and swing your arms naturally.',
      'Start at a pace you can hold a conversation at.',
    ],
    mistakes: [
      'Overstriding, which brakes every step instead of driving it forward.',
      'Gripping the handrails, which shortens your stride and skews your posture.',
    ],
    blurb: 'A low-impact way to build walking volume at a controlled, repeatable pace.',
    freeExerciseDbId: 'Walking_Treadmill',
    videoId: 'HxsFneJFM2c',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'treadmill-incline-walk': {
    cues: [
      'Hold the rails only for balance, not to unload your legs.',
      'Lean slightly from the ankles, not the waist.',
      'Shorten your stride as the incline goes up.',
    ],
    mistakes: [
      'Leaning on the rails, which quietly removes most of the training effect.',
      'Keeping a flat-ground stride length on a steep incline.',
    ],
    blurb:
      'Raises the effort of a walk without adding impact — a glute- and calf-heavy way to build cardio base.',
    freeExerciseDbId: 'Walking_Treadmill',
    videoId: 'NAsObfFJXvE',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'treadmill-run': {
    cues: [
      'Keep cadence quick and light; let the belt do the pull.',
      "Don't reach forward with your lead foot.",
      'Breathe on a rhythm you can sustain the whole run.',
    ],
    mistakes: [
      'Reaching the foot out ahead of the hips (overstriding).',
      'Starting faster than the pace you can hold to the end.',
    ],
    blurb: 'Belt-paced running — useful for holding an exact pace or effort indoors.',
    freeExerciseDbId: 'Running_Treadmill',
    videoId: 'HxsFneJFM2c',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'outdoor-walk': {
    cues: [
      'Pick even, predictable terrain for a consistent pace.',
      'Keep a tall posture and a relaxed arm swing.',
      'Warm up the first few minutes before settling into pace.',
    ],
    mistakes: [
      'Choosing uneven or crowded terrain that forces constant pace changes.',
      'Setting off at your fastest pace instead of easing in.',
    ],
    blurb: 'The simplest cardio there is — logged by time and distance, wherever you walk.',
    freeExerciseDbId: null,
    videoId: '-fD2TSL2s7I',
    videoStartSec: 0,
    videoChannel: 'Rehab and Revive',
  },
  'outdoor-run': {
    cues: [
      'Start conservative: the first outdoor km always feels easier than it is.',
      'Land under your hips, not reaching out in front.',
      'Save your fastest effort for the last third of the run.',
    ],
    mistakes: [
      'Going out too hard because the first kilometre feels easy.',
      'Ignoring terrain and weather when judging pace against a flat treadmill run.',
    ],
    blurb:
      'Running outdoors — pace varies with terrain and weather, so judge effort by feel as much as pace.',
    freeExerciseDbId: null,
    videoId: '_kGESn8ArrU',
    videoStartSec: 0,
    videoChannel: 'Global Triathlon Network',
  },
  'outdoor-cycle': {
    cues: [
      'Check brakes and tire pressure before every ride.',
      'Keep a steady cadence rather than mashing hard, slow pedal strokes.',
      'Shift down before a hill, not halfway up it.',
    ],
    mistakes: [
      'Skipping a quick brake and tire check before setting off.',
      'Mashing a low cadence instead of spinning a lighter gear faster.',
    ],
    blurb:
      'Outdoor cycling — logged by time and distance; effort swings with hills, wind and traffic.',
    freeExerciseDbId: null,
    videoId: '4ssLDk1eX9w',
    videoStartSec: 0,
    videoChannel: 'Global Cycling Network',
  },
  'stationary-bike-upright': {
    cues: [
      'Set seat height so your knee has a slight bend at extension.',
      'Keep a light grip on the handlebars, not locked elbows.',
      'Pedal in smooth circles rather than stomping down.',
    ],
    mistakes: [
      'Setting the seat too low, so the knees do all the work.',
      'Rocking the hips to reach the pedals instead of adjusting the seat.',
    ],
    blurb: 'A steady, low-impact bike session — resistance and pace are fully in your control.',
    freeExerciseDbId: 'Bicycling_Stationary',
    videoId: 'fW-gDFOLaCk',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'stationary-bike-recumbent': {
    cues: [
      'Recline the seat back for lower-back support, not a slouch.',
      'Set the seat so your knee has a slight bend at extension.',
      'Keep your feet flat through the whole pedal stroke.',
    ],
    mistakes: [
      'Sliding down into a slouch instead of using the seat back support.',
      'Leaving the seat too far forward, cramping the knees at the top.',
    ],
    blurb:
      'The back-supported bike — an easier entry point for longer, lower-impact cardio sessions.',
    freeExerciseDbId: null,
    videoId: 'ckJRUKyJ8cI',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'spin-class': {
    cues: [
      'Keep hips still on the saddle even when you stand to pedal.',
      'Match resistance to the instructor cue, not just the beat.',
      'Take a drink at every easier interval.',
    ],
    mistakes: [
      'Bouncing in the saddle instead of keeping the hips quiet.',
      'Chasing the music tempo instead of the coached resistance and effort.',
    ],
    blurb:
      'An instructor-led bike session — logged by time and effort since resistance varies through the class.',
    freeExerciseDbId: null,
    videoId: 'ufhbfTWpYEk',
    videoStartSec: 0,
    videoChannel: 'SpinFriends',
  },
  'pilates-class': {
    cues: [
      'Draw the belly in gently before every movement.',
      'Move slowly and let the breath set the pace.',
      'Keep the ribs soft and the neck long.',
    ],
    mistakes: [
      'Rushing through reps and losing the controlled core hold.',
      'Holding the breath instead of breathing with each move.',
    ],
    blurb:
      'A studio or mat class built on control and core strength — logged by time and how hard it felt.',
    freeExerciseDbId: null,
    videoId: 'bbsElOlWBcw',
    videoStartSec: 0,
    videoChannel: 'Trifecta Pilates',
  },
  'yoga-class': {
    cues: [
      'Breathe through the nose and move with each breath.',
      'Ease into each pose; never force the stretch.',
      'Rest in child pose whenever you need a break.',
    ],
    mistakes: [
      'Pushing into a stretch until it hurts instead of easing in.',
      'Skipping the final rest, which is part of the practice.',
    ],
    blurb:
      'Any yoga class, from flow to restorative — logged by time since the load varies with the style.',
    freeExerciseDbId: null,
    videoId: 'vNyJuQuuMC8',
    videoStartSec: 0,
    videoChannel: 'Yoga With Adriene',
  },
  'hiit-class': {
    cues: [
      'Go hard in the work blocks and truly rest in the breaks.',
      'Land softly and keep the knees tracking over the toes.',
      'Keep water close and sip between rounds.',
    ],
    mistakes: [
      'Going all-out from the first round and fading by the third.',
      'Letting form collapse when tired instead of scaling the move.',
    ],
    blurb:
      'A high-intensity interval or bootcamp class — logged by time, with effort and kcal if you know them.',
    freeExerciseDbId: null,
    videoId: 'zghuACZGqoY',
    videoStartSec: 0,
    videoChannel: 'The Body Coach TV by Joe Wicks',
  },
  'dance-class': {
    cues: [
      'Keep the knees soft and the core lightly braced.',
      'Follow the instructor first; add intensity once you know the steps.',
      'Take a breather when the heart rate spikes.',
    ],
    mistakes: [
      'Locking the knees on repeated jumps and pivots.',
      'Skipping the warm-up because the music feels easy.',
    ],
    blurb:
      'Zumba or any dance-fitness class — logged by time since the intensity follows the choreography.',
    freeExerciseDbId: null,
    videoId: 'mZeFvX3ALKY',
    videoStartSec: 0,
    videoChannel: 'Zumba',
  },
  swimming: {
    cues: [
      'Exhale steadily under water so the breath stays smooth.',
      'Reach long and rotate from the hips with each stroke.',
      'Rest at the wall when your stroke starts to fall apart.',
    ],
    mistakes: [
      'Lifting the head to breathe, which sinks the hips.',
      'Sprinting the first laps and having nothing left.',
    ],
    blurb:
      'Pool swimming of any stroke — logged by time, with kcal from your watch if it tracks it.',
    freeExerciseDbId: null,
    videoId: '6_vXycbD2TM',
    videoStartSec: 0,
    videoChannel: 'Global Triathlon Network',
  },
  running: {
    cues: [
      'Run at a pace where you could still speak in sentences.',
      'Land under the hips with a quick, light cadence.',
      'Relax the shoulders and swing the arms loosely.',
    ],
    mistakes: [
      'Starting too fast and fading halfway through.',
      'Overstriding, which brakes every step and loads the knees.',
    ],
    blurb:
      'A run logged by time only — use it when you did not track distance, or for a quick log.',
    freeExerciseDbId: null,
    videoId: '_kGESn8ArrU',
    videoStartSec: 0,
    videoChannel: 'Global Triathlon Network',
  },
  walking: {
    cues: [
      'Walk tall with the eyes up and the shoulders relaxed.',
      'Swing the arms naturally and keep a brisk pace.',
      'Wear shoes you are happy to cover distance in.',
    ],
    mistakes: [
      'Slouching forward over the phone as you walk.',
      'Taking very long strides that put the heel far ahead.',
    ],
    blurb: 'A walk or hike logged by time only — easy on the body and counts toward your week.',
    freeExerciseDbId: null,
    videoId: '-fD2TSL2s7I',
    videoStartSec: 0,
    videoChannel: 'Rehab and Revive',
  },
  'other-activity': {
    cues: [
      'Note the time you were actually moving, not the whole visit.',
      'Add kcal from your watch or the machine if you have it.',
      'Rate the effort so the day reads honestly later.',
    ],
    mistakes: [
      'Counting waiting and chatting time in the duration.',
      'Guessing a kcal number instead of leaving it blank.',
    ],
    blurb: 'Any activity that does not fit the other chips — name it yourself when you log it.',
    freeExerciseDbId: null,
    videoId: '9C-M-c-8GOw',
    videoStartSec: 0,
    videoChannel: 'Emma Mattison',
  },
  elliptical: {
    cues: [
      "Keep a tall posture — don't lean on the front rail.",
      'Push and pull evenly through both arms and legs.',
      'Vary resistance rather than only stride speed.',
    ],
    mistakes: [
      'Leaning on the front rail, which quietly cuts the training effect.',
      'Taking tiny, rushed strides instead of a full, controlled stride.',
    ],
    blurb:
      'A no-impact, full-body cardio machine — good on days a joint needs a break from running.',
    freeExerciseDbId: 'Elliptical_Trainer',
    videoId: 'RakIFxUmSpA',
    videoStartSec: 0,
    videoChannel: 'Live Lean TV Daily Exercises',
  },
  'rowing-machine': {
    cues: [
      'Sequence legs, then hips, then arms on the drive.',
      'Reverse the order — arms, hips, legs — on the recovery.',
      'Keep the same stroke length as you settle into pace.',
    ],
    mistakes: [
      'Pulling with the arms first instead of driving with the legs.',
      'Shortening the stroke as fatigue sets in instead of easing the pace.',
    ],
    blurb:
      'A full-body, low-impact machine — distance is logged in metres, the standard rowing unit.',
    freeExerciseDbId: 'Rowing_Stationary',
    videoId: '6_eLpWiNijE',
    videoStartSec: 0,
    videoChannel: 'PureGym',
  },
  'stair-climber': {
    cues: [
      "Stand tall — don't lean on the handles.",
      'Take full steps rather than tiny, rapid ones.',
      'Keep a pace you can hold for the whole session.',
    ],
    mistakes: [
      'Leaning on the handles, which removes most of the training effect.',
      'Taking short, shuffling steps instead of a full stepping motion.',
    ],
    blurb:
      'A demanding lower-body cardio machine — logged by time and effort rather than distance.',
    freeExerciseDbId: 'Stairmaster',
    videoId: 'tl90dPJ9Od8',
    videoStartSec: 0,
    videoChannel: 'Body Mountain',
  },
};
