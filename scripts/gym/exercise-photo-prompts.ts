/**
 * exercise-photo-prompts.ts — the AI photo brief for every exercise that has no
 * free-exercise-db or openly licensed photo (WP-25 lane x). One shared house style
 * (same lighting, framing, camera angle), only the person, the setup and the
 * start/end position differ, so the whole library reads as one set.
 *
 * Frame 0 = start position, frame 1 = end position; both use the same seed so
 * the person and the room stay the same between the two frames.
 */

export type Who = 'man' | 'woman';

export type PhotoBrief = {
  who: Who;
  /** Equipment / scene, e.g. "next to a barbell loaded with plates". */
  setup: string;
  /** Start position (frame 0). */
  start: string;
  /** End position (frame 1). */
  end: string;
  /** Camera angle; side view unless the movement reads better from elsewhere. */
  view?: string;
};

const PERSON: Record<Who, string> = {
  man: 'a fit athletic man with short dark hair in a grey t-shirt and black shorts',
  woman: 'a fit athletic woman with a ponytail in a navy sports top and black leggings',
};

/** Negative prompt for Stable Diffusion models (flux ignores it). */
export const NEGATIVE_PROMPT =
  '(deformed, distorted, disfigured:1.3), bad anatomy, wrong anatomy, extra limbs, extra legs, ' +
  'extra arms, missing limbs, fused fingers, mutated hands, floating limbs, disconnected limbs, ' +
  'close-up, cropped, cut off, out of frame, blurry, text, watermark, logo, cartoon, illustration, painting, 3d render';

/**
 * One house style for every render: a wide shot, so the whole movement and the gear
 * are visible (the models love portrait close-ups otherwise), in the same bright gym.
 */
export function photoPrompt(brief: PhotoBrief, frame: 0 | 1): string {
  const pose = frame === 0 ? brief.start : brief.end;
  const setup = brief.setup ? `, ${brief.setup}` : '';
  const view = (brief.view ?? 'Side view').toLowerCase();
  // The pose comes straight after the subject: the models weigh the first words most.
  return (
    `A wide-angle ${view} photograph, taken from several metres away in a bright modern gym ` +
    `with white walls and large windows, of ${PERSON[brief.who]}${setup}, ` +
    `${pose.charAt(0).toLowerCase()}${pose.slice(1)}. ` +
    `The entire body from head to feet and all the equipment are fully visible. ` +
    `Natural window light, sharp focus, realistic DSLR photo.`
  );
}

/** Exercises rendered by AI, in catalog order. Cardio/class presets use licensed scene photos. */
export const PHOTO_BRIEFS: Readonly<Record<string, PhotoBrief>> = {
  'pendlay-row': {
    who: 'man',
    setup: 'with a loaded barbell on the floor',
    start:
      'bent far forward at the hips with a flat back so the torso is almost parallel to the floor, knees slightly bent, both hands gripping the barbell that rests on the floor, arms hanging straight down',
    end: 'bent over with the torso still parallel to the floor and a flat back, pulling the barbell up from the floor until the bar touches his lower chest, elbows bent and pointing up behind the body',
  },
  'landmine-press': {
    who: 'man',
    setup:
      'at a landmine press station, a barbell fixed at one end to a base on the floor so the other, plated end sticks up and out at an angle',
    start:
      'standing with one hand gripping the raised plated end of the angled barbell at his shoulder, elbow bent',
    end: 'standing with the same arm pressed straight out and up, lifting the raised plated end of the angled barbell above shoulder height',
  },
  'kettlebell-press': {
    who: 'man',
    setup: 'holding a single kettlebell in one hand',
    start:
      'Standing tall, the kettlebell held in the rack position at the shoulder with the elbow tucked against the ribs, the other arm relaxed at the side',
    end: 'Standing tall, the kettlebell pressed straight overhead with the arm fully locked out, the other arm relaxed at the side',
  },
  'machine-lateral-raise': {
    who: 'woman',
    setup: 'seated on a lateral raise machine with padded arm levers',
    start:
      'seated upright with both arms hanging down at her sides, her forearms resting against the padded levers, elbows slightly bent, looking straight ahead',
    end: 'Seated upright, both arms raised out to the sides to shoulder height pushing the pads up',
    view: 'Front three-quarter view',
  },
  'assisted-dip': {
    who: 'man',
    setup:
      'at an assisted dip machine: a tall vertical frame with two parallel handles at chest height and a padded kneeling platform that rides on a weight stack',
    start:
      'kneeling on the padded platform, his hands gripping the two parallel handles, arms fully straight, body upright',
    end: 'kneeling on the padded platform, his hands gripping the two parallel handles, elbows bent to ninety degrees and the body lowered between the handles',
  },
  'pendulum-squat': {
    who: 'man',
    setup:
      'on a pendulum squat machine, shoulders under the padded shoulder supports, feet on the foot platform',
    start: 'Standing upright with legs nearly straight at the top of the machine movement',
    end: 'In the bottom of a deep squat with the thighs below parallel to the floor',
  },
  'belt-squat': {
    who: 'man',
    setup:
      'on a belt squat machine, a weighted belt around his hips attached to a loaded lever below, standing on two raised platforms, hands on the handles',
    start: 'Standing tall with legs straight',
    end: 'In the bottom of a deep squat with the thighs parallel to the floor and the back upright',
  },
  'kettlebell-swing': {
    who: 'man',
    setup: 'with a heavy kettlebell, gripping it with both hands',
    start:
      'Hips hinged back, torso leaning forward with a flat back, the kettlebell swinging back between the legs',
    end: 'Standing tall with hips fully extended, arms straight out in front, the kettlebell at chest height',
  },
  'kettlebell-deadlift': {
    who: 'woman',
    setup: 'with a heavy kettlebell on the floor between her feet',
    start:
      'Hips hinged back and knees bent, flat back, both hands gripping the kettlebell handle on the floor',
    end: 'Standing tall, hips and knees fully extended, the kettlebell hanging in both hands in front of the thighs',
  },
  'bulgarian-split-squat': {
    who: 'man',
    setup:
      'with a flat bench behind him, holding a dumbbell in each hand at his sides, the back foot resting on the bench',
    start: 'Standing upright in a split stance, front foot forward and the rear foot on the bench',
    end: 'Lowered into the split squat with the front thigh parallel to the floor and the rear knee just above the floor, torso upright',
  },
  'glute-kickback-machine': {
    who: 'woman',
    setup:
      'on a standing glute kickback machine, hands on the handles, chest against the pad, one foot on the lever plate',
    start: 'The working knee bent and brought forward under the hips',
    end: 'The working leg pressed back and extended straight behind her, glute squeezed',
  },
  plank: {
    who: 'woman',
    setup: 'on a yoga mat',
    start:
      'in a forearm plank: face down with both forearms flat on the mat and the elbows directly under the shoulders, only the forearms and the toes touching the floor, the whole body perfectly straight and parallel to the floor like a plank of wood from head to heels, the head in line with the spine, looking down at the mat',
    end: 'in a forearm plank: face down with both forearms flat on the mat and the elbows directly under the shoulders, only the forearms and the toes touching the floor, hips level with the shoulders, the whole body perfectly straight and parallel to the floor from head to heels',
  },
  'hollow-body-hold': {
    who: 'woman',
    setup: 'on an exercise mat',
    start:
      'lying flat on her back on the mat with both arms stretched straight back overhead beside her ears and both legs straight and together on the mat',
    end: 'lying on her back on the mat in the hollow body position: her shoulders and her straight legs both lifted off the mat, her arms stretched straight beside her ears, only the lower back pressing into the mat, the body forming a shallow banana curve',
  },
  'bird-dog': {
    who: 'woman',
    setup: 'on an exercise mat',
    start:
      'On all fours with the hands under the shoulders and the knees under the hips, back flat, head neutral',
    end: 'doing the bird dog exercise: on her hands and knees on the mat in a tabletop position, with her right arm reaching straight forward and her left leg reaching straight back, both lifted off the floor and level with her flat back, so that her hand, spine and foot make one horizontal line',
  },
  'suitcase-carry': {
    who: 'man',
    setup: 'holding one heavy dumbbell in his right hand',
    start:
      'standing tall with feet together, a heavy dumbbell hanging straight down in his right hand at his side, the left hand empty, shoulders level and the torso upright',
    end: 'walking forward in mid-stride, a heavy dumbbell hanging straight down in his right hand at his side, the left hand empty, the torso upright and not leaning to either side',
  },
  'dumbbell-hip-thrust': {
    who: 'woman',
    setup:
      'with her upper back resting against the long side of a flat bench and a dumbbell lying across her hips, her feet flat on the floor',
    start:
      'sitting on the floor in front of the bench with her bottom close to the floor, knees bent',
    end: 'doing a glute bridge on a bench: her shoulder blades rest on the bench, her feet are flat on the floor, her hips are lifted up high so that her body is a straight diagonal line from her shoulders to her knees, with a dumbbell resting on her hip bones, seen from the side',
  },
  'pistol-squat': {
    who: 'man',
    setup: '',
    start:
      'standing on her right leg only, her left leg lifted and held straight out in front of her above the floor, both arms stretched forward for balance',
    end: 'balancing on her right foot only, squatting down as low as possible on that one leg, while her left leg is held straight out in front of her, floating in the air, not touching the floor, her arms stretched forward',
  },
  'wall-sit': {
    who: 'woman',
    setup: 'next to a plain wall',
    start: 'Standing with her back against the wall, feet shoulder-width apart',
    end: 'in a wall sit: her whole back flat against the wall, sitting in an invisible chair with her thighs horizontal and parallel to the floor and her knees bent ninety degrees directly above her ankles, feet flat on the floor, arms hanging relaxed at her sides',
  },
  'reverse-lunge': {
    who: 'woman',
    setup: '',
    start: 'Standing tall with hands on the hips and feet together',
    end: 'At the bottom of a reverse lunge: one leg stepped far back with the rear knee just above the floor, the front thigh parallel to the floor, torso upright',
  },
  'lateral-lunge': {
    who: 'woman',
    setup: '',
    start: 'Standing tall with the feet together and hands clasped in front of the chest',
    end: 'At the bottom of a lateral lunge: one leg stepped wide to the side with the knee bent and the hips pushed back, the other leg straight, torso upright',
    view: 'Front view',
  },
  'step-up': {
    who: 'man',
    setup: 'in front of a sturdy plyo box',
    start:
      'Standing facing the box with one foot placed flat on top of it, the other foot on the floor',
    end: 'Standing tall on top of the box with the other knee lifted to hip height',
  },
  'bodyweight-bulgarian-split-squat': {
    who: 'woman',
    setup: 'with a flat bench behind her, the back foot resting on the bench, hands on the hips',
    start: 'Standing upright in a split stance, front foot forward and the rear foot on the bench',
    end: 'lowered into a Bulgarian split squat: the top of her rear foot is resting on the flat bench behind her, her front foot is planted far in front, her front thigh is parallel to the floor and her rear knee hovers just above the floor, torso upright, hands on hips',
  },
  'single-leg-romanian-deadlift': {
    who: 'woman',
    setup: '',
    start: 'Standing tall on one leg with the arms hanging in front of the thighs',
    end: 'Hinged forward at the hips on one slightly bent leg, torso parallel to the floor, the other leg extended straight behind in line with the back, arms hanging straight down',
  },
  clamshell: {
    who: 'woman',
    setup: 'on an exercise mat',
    start:
      'lying on her left side on the mat with her head resting on her left arm, her hips and knees bent so that her legs are folded in front of her, the knees and feet stacked together',
    end: 'lying on her left side on the mat with her head resting on her left arm, her legs folded in front of her, her feet together and her top knee lifted open towards the ceiling like a clamshell',
    view: 'Front view from slightly above',
  },
  'single-leg-calf-raise': {
    who: 'man',
    setup: 'standing on the edge of a step, one hand lightly on a wall for balance',
    start: 'Standing on one foot with the heel dropped below the step, the other foot lifted',
    end: 'Standing on one foot raised high up onto the toes, the other foot lifted',
  },
  'kneeling-push-up': {
    who: 'woman',
    setup: 'on a yoga mat',
    start:
      'In the top position of a kneeling push-up: arms straight with the hands under the shoulders, knees on the mat, a straight line from head to knees',
    end: 'At the bottom of a kneeling push-up: elbows bent, chest lowered close to the mat, a straight line from head to knees',
  },
  'pike-push-up': {
    who: 'man',
    setup: 'on a yoga mat',
    start:
      'In the top of a pike push-up: hips raised high in an inverted V, legs and arms straight, head between the arms',
    end: 'at the bottom of a pike push-up seen from the side: hips high in an inverted V, legs straight, elbows bent and the top of the head lowered toward the mat between the hands',
  },
};

/**
 * Cardio / class presets without a licensed photo: one representative scene per
 * frame (there is no single movement to demonstrate), written as complete prompts.
 */
export const SCENE_BRIEFS: Readonly<Record<string, { start: string; end: string }>> = {
  walking: {
    start:
      'Photo of a woman in casual sportswear walking briskly on a tree-lined park path, full body in frame, side view, morning light',
    end: 'Photo of a man in a t-shirt and sneakers power walking on a city sidewalk, arms swinging, full body in frame, side view, morning light',
  },
  'outdoor-walk': {
    start:
      'Photo of a woman walking on a gravel trail through a green meadow, full body in frame, side view, golden hour light',
    end: 'Photo of a man walking along a scenic lakeside path, full body in frame, side view, sunny day',
  },
  'outdoor-cycle': {
    start:
      'Photo of a cyclist in a helmet riding a road bike on a quiet country road, full body and bike in frame, side view, sunny day',
    end: 'Photo of a cyclist in a helmet riding a bike along a riverside cycle path, full body and bike in frame, side view, golden hour light',
  },
  'stationary-bike-recumbent': {
    start:
      'Photo of a woman exercising on a recumbent exercise bike in a bright gym, seated reclined with back support, full body and bike in frame, side view',
    end: 'Photo of a man pedalling on a recumbent exercise bike in a bright modern gym, seated reclined with back support, full body and bike in frame, side view',
  },
  'yoga-class': {
    start:
      'Photo of a group yoga class in a bright studio, several people on mats in downward dog pose, wide shot, soft natural light',
    end: 'Photo of a group yoga class in a bright studio, several people on mats in warrior two pose, wide shot, soft natural light',
  },
  'hiit-class': {
    start:
      'Photo of a small group fitness bootcamp class in a bright gym, people doing jumping jacks together, wide shot, full bodies in frame',
    end: 'Photo of a small group fitness bootcamp class in a bright gym, people doing squat jumps together, wide shot, full bodies in frame',
  },
  'other-activity': {
    start:
      'Still life photo of sports gear on a wooden bench: running shoes, a water bottle, a towel and a stopwatch, bright natural light, clean background',
    end: 'Photo of a person stretching their arms overhead outdoors at sunrise, full body in frame, side view, warm light',
  },
};

/** Complete prompt for one frame of any AI-rendered exercise. */
export function promptFor(id: string, frame: 0 | 1): string | undefined {
  const brief = PHOTO_BRIEFS[id];
  if (brief) return photoPrompt(brief, frame);
  const scene = SCENE_BRIEFS[id];
  if (scene) {
    return `${frame === 0 ? scene.start : scene.end}, sharp focus, professional photography, DSLR photo, 8k, realistic`;
  }
  return undefined;
}

export const AI_EXERCISE_IDS: readonly string[] = [
  ...Object.keys(PHOTO_BRIEFS),
  ...Object.keys(SCENE_BRIEFS),
];
