// Maestro `runScript` step for coaching-request.flow.yaml: the trainer accepts the client's pending
// request over HTTP (Trainer tools → Requests → Accept on a second device, in effect).
//
//   API_URL   base URL of the API (default http://localhost:3001)
//   T_TOKEN   the trainer's session token (coaching-request-setup.js output.tToken)

var API = typeof API_URL !== 'undefined' && API_URL ? API_URL : 'http://localhost:3001';
var HEADERS = {
  'content-type': 'application/json',
  'x-chefer-client': 'mobile',
  'x-trpc-source': 'maestro',
  'x-chefer-api-level': '6',
  authorization: 'Bearer ' + T_TOKEN,
};

function check(path, response) {
  if (!response.ok) {
    throw new Error(
      'coaching-request-accept: ' +
        path +
        ' failed (' +
        response.status +
        '): ' +
        String(response.body).substring(0, 300),
    );
  }
  return JSON.parse(response.body).result.data.json;
}

var list = check(
  'trainer.requests.list',
  http.get(API + '/trpc/trainer.requests.list?input=' + encodeURIComponent('{"json":null}'), {
    headers: HEADERS,
  }),
);
if (!list.length) throw new Error('coaching-request-accept: the trainer has no pending request');
check(
  'trainer.requests.accept',
  http.post(API + '/trpc/trainer.requests.accept', {
    headers: HEADERS,
    body: JSON.stringify({ json: { requestId: list[0].id } }),
  }),
);
