# Changelog

## 0.1.1

### Security

- Refreshed transitive development dependencies flagged by the Grafana plugin
  validator's osv-scanner, which blocked the release build: `websocket-driver`
  (CVE-2026-54466, critical), `fast-uri` (CVE-2026-13676, CVE-2026-16221),
  `form-data` (CVE-2026-12143), `js-yaml` (CVE-2026-59869), `postcss`, and
  `serialize-javascript`. The last one required `copy-webpack-plugin` 13 → 14,
  which only raises the minimum Node version to 20.9 (this package already
  requires 22) and keeps the `patterns` API unchanged. No shipped panel code
  depends on any of these — they are build- and test-time only.

### Fixed

- `GraphNodeKind` / `GraphEdgeType` are now plain `string` aliases instead of
  `NodeKind | (string & {})` / `EdgeType | (string & {})`, clearing SonarQube
  `typescript:S4335` (the `string & {}` intersection collapses to `string`, so the
  union was redundant). Runtime behaviour is unchanged — unknown backend kinds and
  edge types are still kept, still visible by default in `computeVisibility`, and
  still fall back through `categoryForKind` / the `*_BY_KIND` maps. Closed-union
  autocomplete remains available on `NodeKind` / `EdgeType` themselves.

### Changed

- Package version corrected from the never-released `1.0.0` to `0.1.1`, continuing
  from the published `0.1.0` tag.

## 0.1.0

Initial release.
