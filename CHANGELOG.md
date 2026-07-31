# Changelog

## 0.1.1

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
