// A local stand-in for the handful of Genesys Cloud API calls the Architect Scripting SDK makes while it
// builds a flow. It lets the SDK run without credentials or network access: nothing here talks to a real org.
// The only org-specific facts it serves are the three data actions (ID, name, integration, contract).
const http = require('http');
const https = require('https');

// Where the SDK is told the API lives. Every request is redirected to this stub, so the hosts are never contacted.
const DISCOVERY = ['api.uri=https://api.mypurecloud.com.au', 'auth.uri=https://login.mypurecloud.com.au',
  'public-api.apps.uri=https://apps.mypurecloud.com.au/platform', 'public-api.uri=https://api.mypurecloud.com.au',
  'environment=prod-apse2'].join('\n') + '\n';

const ORG = { id: '00000000-0000-4000-8000-000000000001', name: 'local-stub' };
const DIVISION = { id: '00000000-0000-4000-8000-000000000003', name: 'Home', homeDivision: true };
// Action types the workflow uses; the SDK needs to be told they are available in workflows.
const WORKFLOW_ACTIONS = ['DataAction', 'DecisionAction', 'UpdateVariableAction', 'EndWorkflowAction'];

const ERROR_SCHEMA = (() => {
  const s = { type: 'string' }, list = { type: 'array', items: { type: 'string' } };
  return { type: 'object', properties: {
    errorCode: s, status: { type: 'integer' }, correlationId: s, entityId: s, entityName: s, userMessage: s,
    userParamsMessage: s, 'userParams.key': list, 'userParams.value': list, 'details.errorCode': list,
    'details.fieldName': list, 'details.entityId': list, 'details.entityName': list } };
})();

function createOrgStub(dataActions) {
  const action = (id) => {
    const a = dataActions[id];
    if (!a) return null;
    const base = '/api/v2/integrations/actions/' + id;
    return { id, name: a.name, category: a.category, contract: {
      input: { inputSchema: a.inputSchema, inputSchemaFlattened: { schema: a.inputSchema }, inputSchemaUri: base + '/schemas/input.json' },
      output: { successSchema: a.successSchema, successSchemaFlattened: { schema: a.successSchema }, successSchemaUri: base + '/schemas/success.json',
        errorSchema: ERROR_SCHEMA, errorSchemaFlattened: { schema: ERROR_SCHEMA }, errorSchemaUri: base + '/schemas/error.json' } } };
  };
  const operations = {};
  const page = (entities) => ({ entities, pageSize: 500, pageNumber: 1, total: entities.length, pageCount: 1 });
  const permissions = ['architect:ui:view', 'architect:ui:edit', 'architect:flow:view', 'architect:flow:add', 'architect:flow:edit',
    'integrations:action:view', 'integrations:integration:view'];

  function route(method, url, body) {
    const u = new URL(url, 'http://stub');
    const p = u.pathname.replace(/^\/platform/, '');
    let m;
    if (p === '/services/discovery.properties') return DISCOVERY;
    if (p === '/api/v2/users/me') return { id: '00000000-0000-4000-8000-000000000002', name: 'Local Stub', division: DIVISION,
      token: { organization: ORG, homeOrganization: ORG }, authorization: { roles: [], permissions, permissionPolicies: [] } };
    if (p === '/api/v2/organizations/me') return Object.assign({ defaultLanguage: 'en-us' }, ORG);
    if (p === '/api/v2/authorization/divisions') return page([DIVISION]);
    if (p === '/api/v2/featuretoggles') return Object.fromEntries(u.searchParams.getAll('feature').map((f) => [f, true]));
    if (p === '/api/v2/architect/capabilities') return {
      expansions: { flowTypes: {} },
      featureConfigs: { placeholder: { id: 'placeholder', isAvailable: false } },
      flowTypes: { workflow: { id: 'workflow', isAvailable: true } },
      actions: Object.fromEntries(WORKFLOW_ACTIONS.map((id, i) => [id, { id, flowTypes: { workflow: { id: 'workflow', isAvailable: true } },
        flowTypesDeprecated: {}, categoryInfo: { categoryId: 'data', displayIndex: i + 1 } }])) };
    if (p === '/api/v2/telephony/providers/edges/timezones') return page([{ id: 'UTC', name: 'UTC', offset: 0 }]);
    if (p === '/api/v2/notifications/channels') return { status: 404, body: { message: 'not available in stub', status: 404 } };
    if (p === '/api/v2/diagnostics/trace') return {};
    if ((m = p.match(/^\/api\/v2\/integrations\/actions\/([^/]+)$/))) return action(decodeURIComponent(m[1]));
    // Design-time validation: the SDK posts the list of things the flow references, then polls for their current state.
    if (p === '/api/v2/flows/actions/validate') {
      const id = 'op-' + (Object.keys(operations).length + 1);
      operations[id] = JSON.parse(body || '{}');
      return { id, flowId: u.searchParams.get('flow'), actionName: 'VALIDATE', actionStatus: 'STARTED', complete: false };
    }
    if ((m = p.match(/^\/api\/v2\/flows\/([^/]+)\/validate\/([^/]+)$/))) {
      const results = {};
      for (const [type, items] of Object.entries(operations[m[2]] || {})) {
        results[type] = (items || []).map((item) => {
          if (type !== 'dataAction') return Object.assign({}, item, { result: 'ok' });
          const a = action(item.id);
          return a ? Object.assign(a, { result: 'ok' }) : { id: item.id, name: item.name, result: 'does.not.exist' };
        });
      }
      return { id: m[2], flowId: m[1], actionName: 'VALIDATE', actionStatus: 'SUCCESS', complete: true, results };
    }
    return null;
  }

  const unhandled = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (d) => { body += d; });
    req.on('end', () => {
      let out = route(req.method, req.url, body);
      if (out === null) { unhandled.push(req.method + ' ' + req.url); out = { status: 404, body: { message: 'not handled by stub', status: 404 } }; }
      const status = out && out.status && out.body ? out.status : 200;
      const payload = out && out.status && out.body ? out.body : out;
      res.writeHead(status, { 'content-type': typeof payload === 'string' ? 'text/plain' : 'application/json', 'inin-correlation-id': 'stub' });
      res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });
  });

  return {
    unhandled,
    // Starts the stub and sends every HTTPS request made by this process to it instead of the internet.
    async start() {
      await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
      const port = server.address().port;
      const redirect = (args) => {
        let [first, second, third] = args;
        let options = {};
        if (typeof first === 'string' || first instanceof URL) {
          const url = new URL(first);
          options = { method: 'GET', path: url.pathname + url.search, headers: { host: url.host } };
          if (second && typeof second === 'object') Object.assign(options, second);
        } else {
          options = Object.assign({}, first);
        }
        const callback = typeof second === 'function' ? second : third;
        for (const k of ['agent', 'ca', 'cert', 'key', 'servername', 'rejectUnauthorized', '_defaultAgent']) delete options[k];
        Object.assign(options, { protocol: 'http:', host: '127.0.0.1', hostname: '127.0.0.1', port });
        return [options, callback];
      };
      https.request = (...args) => http.request(...redirect(args));
      https.get = (...args) => { const req = http.request(...redirect(args)); req.end(); return req; };
    },
    stop() { server.close(); }
  };
}

module.exports = { createOrgStub };
