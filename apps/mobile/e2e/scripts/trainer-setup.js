// Maestro `runScript` setup for trainer-edit.flow.yaml (WP-18 lane C).
//
// Runs on the HOST (GraalJS, Maestro's `http` API), before the app is touched: it registers two throwaway
// users over HTTP against the local API, turns trainer tools on for the first ("Ana"), completes gym setup
// for the second (a client needs a routine and equipment), and links the client to the trainer through an
// invite, exactly as the join screen does. The coaching flag must be on for the API
// (FEATURE_FLAGS=coaching, TRAINER_ALLOWLIST=*).
//
//   API_URL   base URL of the API (default http://localhost:3001); pass it with
//             `maestro test -e API_URL=http://localhost:<port> …` when the API runs on another port.
//
// Output (read in the flow as ${output.<name>}):
//   tEmail, tPassword   the trainer the flow signs in as
//   cName, cFirst       the client's display name and first name
//
// Budget: 2 registers of the per-IP auth rate limit (10 / 15 min by default). tRPC over HTTP with
// superjson: a single call is `POST /trpc/<path>` with `{"json": …}`; the answer is
// `{"result":{"data":{"json": …}}}`. The headers are the mobile app's plus level 6 (coaching).

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
      'trainer-setup: ' +
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
      'trainer-setup: ' +
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
  var email = 'maestro-trainer-' + label + '-' + stamp + '@e2e.chefer.dev';
  var registered = call('auth.register', {
    email: email,
    password: PASSWORD,
    firstName: firstName,
    acceptedTerms: true,
    ageConfirmed: true,
    acceptedTermsVersion: TERMS_VERSION,
  });
  if (!registered.session || !registered.session.token) {
    throw new Error('trainer-setup: register returned no session token');
  }
  return { id: registered.id, email: email, firstName: firstName, token: registered.session.token };
}

var trainer = makeUser('t', 'Ana');
var client = makeUser('c', 'Mx' + randomLetters(6));

// FORBIDDEN here means trainer tools are off for this API (FEATURE_FLAGS=coaching, TRAINER_ALLOWLIST).
call('trainer.activate', { displayName: 'Ana' }, trainer.token);

// The client needs a gym profile and routine before joining (the engine needs the equipment).
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

var invite = call('trainer.invites.create', { label: 'Maestro client' }, trainer.token);
call('coaching.join', { code: invite.code }, client.token);

output.tEmail = trainer.email;
output.tPassword = PASSWORD;
output.cFirst = client.firstName;
output.cName = client.firstName;
