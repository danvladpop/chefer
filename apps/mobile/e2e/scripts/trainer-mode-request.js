// Maestro `runScript` step for trainer-mode.flow.yaml: the client asks the trainer to coach them over
// HTTP (Find a trainer → Ask to coach me on a second phone, in effect), so a request is pending.
//
//   API_URL      base URL of the API (default http://localhost:3001)
//   C_TOKEN      the client's session token (trainer-mode-setup.js output.cToken)
//   TRAINER_ID   the trainer's user id (trainer-mode-setup.js output.trainerId)

var API = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'http://localhost:3001';

function today() {
  var d = new Date();
  var pad = function (n) {
    return (n < 10 ? '0' : '') + n;
  };
  return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
}

var response = http.post(API + '/trpc/coaching.requestCoaching', {
  headers: {
    'content-type': 'application/json',
    'x-chefer-client': 'mobile',
    'x-trpc-source': 'maestro',
    'x-chefer-api-level': '6',
    authorization: 'Bearer ' + C_TOKEN,
  },
  body: JSON.stringify({ json: { trainerId: TRAINER_ID, localDate: today() } }),
});
if (!response.ok) {
  throw new Error(
    'trainer-mode-request: coaching.requestCoaching failed (' +
      response.status +
      '): ' +
      String(response.body).substring(0, 300),
  );
}
