// Maestro `runScript` setup for trainer-bookings.flow.yaml (docs/prd-2026-10/trainer-mode.md §6.2, §6.3,
// §6.9, M3). Same plumbing as trainer-templates-setup.js.
//
// Runs on the HOST (GraalJS, Maestro's `http` API): registers a trainer with trainer tools on (gym line
// "Iron Gym, Cluj", the editor's default location) and two clients with gym setup done, and links both to
// the trainer through invites (`trainer.invites.create` + `coaching.join`), exactly as the join screen
// does. The trainer has no bookings yet. Sends API level 8 (TRAINER_MODE_API_LEVEL).
// The API must run with FEATURE_FLAGS=coaching,trainerMode,mobileShellV2 and TRAINER_ALLOWLIST=*.
//
// Output (read in the flow as ${output.<name>}):
//   tEmail, tPassword     the trainer the flow signs in as
//   c1Id, c2Id            the two clients' ids as the trainer's client list names them
//   c1Name, c2Name        their display names
//   c1Email, c1Password   client 1, for the second half of the flow (the client sees the booking)
//
// Budget: 3 registers of the per-IP auth rate limit.

var API = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'http://localhost:3001';
var PASSWORD = 'Maestro@123!';
// CURRENT_TERMS_VERSION (@chefer/types legal.ts): the later of the two document dates.
var TERMS_VERSION = '2026-09-30';
var API_LEVEL = '8';

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
      'trainer-bookings-setup: ' +
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
      'trainer-bookings-setup: ' +
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
  var email = 'maestro-trainer-bookings-' + label + '-' + stamp + '@e2e.chefer.dev';
  var registered = call('auth.register', {
    email: email,
    password: PASSWORD,
    firstName: firstName,
    acceptedTerms: true,
    ageConfirmed: true,
    acceptedTermsVersion: TERMS_VERSION,
  });
  if (!registered.session || !registered.session.token) {
    throw new Error('trainer-bookings-setup: register returned no session token');
  }
  return { id: registered.id, email: email, firstName: firstName, token: registered.session.token };
}

var trainerName = 'Ana' + randomLetters(6);
var trainer = makeUser('bt', trainerName);
var clients = [makeUser('bc1', 'Mx' + randomLetters(6)), makeUser('bc2', 'Mx' + randomLetters(6))];

// FORBIDDEN here means trainer tools are off for this API (FEATURE_FLAGS=coaching, TRAINER_ALLOWLIST).
call('trainer.activate', { displayName: trainerName, gymLine: 'Iron Gym, Cluj' }, trainer.token);

for (var i = 0; i < clients.length; i += 1) {
  var client = clients[i];
  // A client with a gym profile and a routine: Today shows the Training section (and its booking card).
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
  var invite = call(
    'trainer.invites.create',
    { label: 'Maestro client ' + (i + 1) },
    trainer.token,
  );
  call('coaching.join', { code: invite.code }, client.token);
}

// The ids the app uses for the clients (the trainer's own list).
var today = new Date();
var pad = function (n) {
  return n < 10 ? '0' + n : String(n);
};
var localDate = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
var rows = query('trainer.clients.list', { today: localDate }, trainer.token);
if (!rows || rows.length !== 2) {
  throw new Error(
    'trainer-bookings-setup: expected 2 active clients, got ' + (rows ? rows.length : 0),
  );
}

// Client 1 is whoever the trainer's list names first (matched by first name; the names are random).
var first = rows[0].name.indexOf(clients[0].firstName) === 0 ? clients[0] : clients[1];

output.tEmail = trainer.email;
output.tPassword = PASSWORD;
output.c1Id = rows[0].clientId;
output.c1Name = rows[0].name;
output.c2Id = rows[1].clientId;
output.c2Name = rows[1].name;
output.c1Email = first.email;
output.c1Password = PASSWORD;
