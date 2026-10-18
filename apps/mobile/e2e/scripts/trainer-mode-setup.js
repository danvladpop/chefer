// Maestro `runScript` setup for trainer-mode.flow.yaml (docs/prd-2026-10/trainer-mode.md, M1). Same
// plumbing as coaching-request-setup.js.
//
// Runs on the HOST (GraalJS, Maestro's `http` API): registers a trainer with trainer tools on (a new
// account: no clients, no requests — trainer Today shows its welcome) and a client with gym setup done,
// who later asks to be coached (trainer-mode-request.js) so the trainer's badges light up.
// The API must run with FEATURE_FLAGS=coaching,trainerMode,mobileShellV2 and TRAINER_ALLOWLIST=*.
//
// Output (read in the flow as ${output.<name>}):
//   tEmail, tPassword   the trainer the flow signs in as
//   trainerId           the trainer's user id (what the client's request names)
//   cToken              the client's session token, for trainer-mode-request.js
//
// Budget: 2 registers of the per-IP auth rate limit.

var API = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'http://localhost:3001';
var PASSWORD = 'Maestro@123!';
// CURRENT_TERMS_VERSION (@chefer/types legal.ts): the later of the two document dates.
var TERMS_VERSION = '2026-09-30';
var API_LEVEL = '6';

var CONSONANTS = 'bcdfghjklmnpqrstvwxz';

function randomLetters(length) {
  var out = '';
  for (var i = 0; i < length; i += 1) {
    out += CONSONANTS.charAt(Math.floor(Math.random() * CONSONANTS.length));
  }
  return out;
}

function call(path, input, token) {
  var headers = {
    'content-type': 'application/json',
    'x-chefer-client': 'mobile',
    'x-trpc-source': 'maestro',
    'x-chefer-api-level': API_LEVEL,
  };
  if (token) headers.authorization = 'Bearer ' + token;
  var response = http.post(API + '/trpc/' + path, {
    headers: headers,
    body: JSON.stringify({ json: input }),
  });
  if (!response.ok) {
    throw new Error(
      'trainer-mode-setup: ' +
        path +
        ' failed (' +
        response.status +
        '): ' +
        String(response.body).substring(0, 300),
    );
  }
  return JSON.parse(response.body).result.data.json;
}

// Queries are GET with the input in the URL (tRPC does not accept POST for a query).
function query(path, input, token) {
  var headers = {
    'x-chefer-client': 'mobile',
    'x-trpc-source': 'maestro',
    'x-chefer-api-level': API_LEVEL,
  };
  if (token) headers.authorization = 'Bearer ' + token;
  var response = http.get(
    API + '/trpc/' + path + '?input=' + encodeURIComponent(JSON.stringify({ json: input })),
    { headers: headers },
  );
  if (!response.ok) {
    throw new Error(
      'trainer-mode-setup: ' +
        path +
        ' failed (' +
        response.status +
        '): ' +
        String(response.body).substring(0, 300),
    );
  }
  return JSON.parse(response.body).result.data.json;
}

function makeUser(label, firstName) {
  var stamp = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  var email = 'maestro-trainer-mode-' + label + '-' + stamp + '@e2e.chefer.dev';
  var registered = call('auth.register', {
    email: email,
    password: PASSWORD,
    firstName: firstName,
    acceptedTerms: true,
    ageConfirmed: true,
    acceptedTermsVersion: TERMS_VERSION,
  });
  if (!registered.session || !registered.session.token) {
    throw new Error('trainer-mode-setup: register returned no session token');
  }
  return { id: registered.id, email: email, firstName: firstName, token: registered.session.token };
}

var trainerName = 'Ana' + randomLetters(6);
var trainer = makeUser('rt', trainerName);
var client = makeUser('rc', 'Mx' + randomLetters(6));

// FORBIDDEN here means trainer tools are off for this API (FEATURE_FLAGS=coaching, TRAINER_ALLOWLIST).
call('trainer.activate', { displayName: trainerName, gymLine: 'Iron Gym, Cluj' }, trainer.token);

// A request needs the client's gym setup first (as an invite join does).
var rec = query(
  'gym.profile.recommend',
  { days: 3, experience: 'BEGINNER', equipmentAccess: 'FULL_GYM' },
  client.token,
);
call(
  'gym.profile.completeSetup',
  {
    days: 3,
    experience: 'BEGINNER',
    equipmentAccess: 'FULL_GYM',
    unit: 'KG',
    templateKey: rec.recommendedKey,
    plannedWeekdays: [0, 2, 4],
    reminderTime: null,
  },
  client.token,
);

output.tEmail = trainer.email;
output.tPassword = PASSWORD;
output.trainerId = trainer.id;
output.cToken = client.token;
