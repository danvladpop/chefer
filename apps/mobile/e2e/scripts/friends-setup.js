// Maestro `runScript` setup for friends-requests.flow.yaml (Following, F2.1).
//
// Runs on the HOST (GraalJS, Maestro's `http` API), before the app is touched:
// it registers two throwaway users over HTTP against the local API,
// turns Following on for both, and makes user B ask to follow user A, who is
// PRIVATE — so A's Activity holds a pending `wants to follow you`.
//
//   API_URL   base URL of the API (default http://localhost:3001); pass it with
//             `maestro test -e API_URL=http://localhost:<port> …` when the
//             integration API runs on another port.
//
// Output (read in the flow as ${output.<name>}):
//   aEmail, aPassword   the account the flow signs in as
//   bId, bName, bFirst  the requester: user id, display name, first name
//
// Budget: 2 registers of the per-IP auth rate limit (10 / 15 min by default),
// same as every other flow that registers. tRPC over HTTP with superjson: a
// single (non-batched) call is `POST /trpc/<path>` with the body `{"json": …}`
// and the answer is `{"result":{"data":{"json": …}}}`; the headers are the
// mobile app's (see src/lib/trpc-links.ts).

var API = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'http://localhost:3001';
var PASSWORD = 'Maestro@123!';
// CURRENT_TERMS_VERSION (@chefer/types legal.ts): the later of the two document dates.
var TERMS_VERSION = '2026-09-30';
var API_LEVEL = '4'; // x-chefer-api-level, as src/lib/trpc-links.ts sends

var CONSONANTS = 'bcdfghjklmnpqrstvwxz';

// Letters only, consonants only: a name's search tokens survive normalisation
// and a random name can never spell a word the filter rejects.
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
      'friends-setup: ' +
        path +
        ' failed (' +
        response.status +
        '): ' +
        String(response.body).substring(0, 300),
    );
  }
  return JSON.parse(response.body).result.data.json;
}

function makeUser(label) {
  var stamp = Date.now() + '-' + Math.floor(Math.random() * 1e6);
  var email = 'maestro-following-' + label + '-' + stamp + '@e2e.chefer.dev';
  var firstName = 'Mx' + randomLetters(6);
  var lastName = 'Lx' + randomLetters(6);
  var registered = call('auth.register', {
    email: email,
    password: PASSWORD,
    firstName: firstName,
    acceptedTerms: true,
    ageConfirmed: true,
    acceptedTermsVersion: TERMS_VERSION,
  });
  if (!registered.session || !registered.session.token) {
    throw new Error(
      'friends-setup: register returned no session token (is x-chefer-client mobile honoured?)',
    );
  }
  return {
    id: registered.id,
    email: email,
    firstName: firstName,
    lastName: lastName,
    token: registered.session.token,
  };
}

function activate(user, visibility) {
  // FORBIDDEN here means Following is off for this API (FEATURE_FLAGS=friends / allowlist).
  call(
    'friends.activate',
    { visibility: visibility, firstName: user.firstName, lastName: user.lastName },
    user.token,
  );
}

var a = makeUser('a');
var b = makeUser('b');
activate(a, 'PRIVATE');
activate(b, 'PUBLIC');

// B asks to follow A; A is private, so this is a request, not a follow.
var followed = call('friends.follow', { userId: a.id }, b.token);
if (followed.relation !== 'requested') {
  throw new Error('friends-setup: expected a pending request, got ' + followed.relation);
}

output.aEmail = a.email;
output.aPassword = PASSWORD;
output.bId = b.id;
output.bFirst = b.firstName;
output.bName = b.firstName + ' ' + b.lastName;
