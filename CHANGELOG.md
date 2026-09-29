# Changelog

The developer documentation carries the version of the Manablox release it documents.

## 0.50.0 - unreleased

The first release of the developer documentation, <https://dev.manablox.io>, for Manablox
0.50.0.

- **Getting started** with a project from `manablox create`, the first space, and reading
  it from a frontend over REST, GraphQL and the SDK.
- **Configuration, the content model, the admin and delivery**: every setting,
  environment variable, field type and API, with guides for Vite + Vue SSR and Nuxt
  frontends.
- **Designed sites and extending**: the website plugin, custom field types, plugins and
  their contract, admin plugins, server routes and modes, jobs, services and hooks.
- **Deployment and reference**: the production images, operations, security, database
  roles, releases, premium plugin licenses, the architecture, the data model, the control
  API, testing and contributing across the Manablox repositories.
- **Generated reference pages** for the error keys, the HTTP API and the hooks, written by
  `manablox docs generate` from the installed packages and checked in CI.
- The site as the `ghcr.io/manablox/dev-docs` image (nginx).
