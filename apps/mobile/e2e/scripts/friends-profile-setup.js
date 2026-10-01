// Setup for friends.flow.yaml (F2.2 M-PROFILE). Maestro runScript (GraalJS).
//
// Puts alice in a known state over HTTP before the flow drives the UI:
//   1. turns Following on for alice if she hasn't (the seed leaves her off so
//      the intro can be tested — M-HOME's flow covers the intro itself);
//   2. unfollows carol, so the flow always starts from `Follow`;
//   3. un-hearts carol's seeded imported recipe (Shakshuka), so the heart
//      always starts empty.
// Idempotent: run it any number of times. Never touches dave's pending
// request to alice (M-HOME's requests flow depends on it).
//
// env: API_URL (e.g. http://localhost:3001), EMAIL, PASSWORD, TARGET_ID, RECIPE_ID
// Raw HTTP to tRPC: superjson-wrapped bodies (`{"json": …}`), one procedure
// per request (no batching).

var base = API_URL.replace(/\/$/, '') + '/trpc/';
var common = {
  'Content-Type': 'application/json',
  'x-chefer-client': 'mobile',
  'x-chefer-api-level': '4',
};

function headers(token) {
  var h = {};
  for (var k in common) h[k] = common[k];
  if (token) h.authorization = 'Bearer ' + token;
  return h;
}

function unwrap(res, what) {
  if (res.status < 200 || res.status >= 300) {
    throw new Error(what + ' failed: HTTP ' + res.status + ' ' + res.body);
  }
  var parsed = json(res.body);
  return parsed && parsed.result && parsed.result.data ? parsed.result.data.json : null;
}

function mutate(path, input, token) {
  var res = http.post(base + path, {
    headers: headers(token),
    body: JSON.stringify({ json: input }),
  });
  return unwrap(res, path);
}

function query(path, input, token) {
  var url = base + path;
  if (input !== undefined) {
    url += '?input=' + encodeURIComponent(JSON.stringify({ json: input }));
  }
  return unwrap(http.get(url, { headers: headers(token) }), path);
}

var login = mutate('auth.login', { email: EMAIL, password: PASSWORD });
var token = login && login.session ? login.session.token : null;
if (!token) throw new Error('auth.login returned no session token');

var me = query('friends.me', undefined, token);
if (!me.activated) {
  mutate(
    'friends.activate',
    { visibility: 'PRIVATE', firstName: 'Alice', lastName: 'Johnson' },
    token,
  );
  console.log('friends-profile-setup: activated Following for ' + EMAIL);
}

mutate('friends.unfollow', { userId: TARGET_ID }, token);

// Best effort: a heart left over from an earlier run is removed; if the
// lookup fails the flow still works (it only checks the snackbar).
try {
  var saved = query('recipe.isSaved', { recipeId: RECIPE_ID }, token);
  if (saved && saved.isSaved) {
    mutate('recipe.toggleFavourite', { recipeId: RECIPE_ID }, token);
  }
} catch (e) {
  console.log('friends-profile-setup: could not reset the heart: ' + e);
}

output.friendsProfileSetup = 'ok';
console.log('friends-profile-setup: ready (not following ' + TARGET_ID + ')');
