// The two fixed REST sub-paths the right-click Change Report lookups hit, appended
// to the resolved detail endpoint base (an explicit option override, else the
// dashboard query's datasource proxy path — see resolveDetailEndpoint). Named once
// here so useNodeDetailUrls references a single source rather than re-typing the
// literal; the panel-rendering spec pins the same two paths as the backend contract
// (config_changes = application-detail `{url}`, code_changes = image-detail
// `{container:{url}}`). The hook's tests keep the literal FULL proxy path in their
// assertions on purpose — an independent contract guard that a wrong value here cannot
// silently pass.
export const DETAIL_CONFIG_CHANGES_PATH = '/api/v1/config_changes';
export const DETAIL_CODE_CHANGES_PATH = '/api/v1/code_changes';
