# Design

## The page

`src/web/pages/404.astro` uses the page layout and has a heading and a link to `/`. Astro writes it as `dist/404.html`, not `404/index.html`, whatever `build.format` says. It renders no snapshot, has no script, and passes the build-output guard. Its wording is a placeholder until the wording pass.

## Serving it: our own Caddyfile

Railpack's documentation says that with `index_fallback: false`, unknown paths answer 404 and serve `404.html` when it is present. Its current SPA Caddyfile template does not: it has only `try_files {path} {path}.html {path}/index.html`, with `/index.html` appended when the fallback is on, and no error handling. The live site's empty 404 body matches the template, not the documentation.

Railpack uses a `Caddyfile` at the repository root instead of its template, and renders it as a Go template with the same data, so `{{.DIST_DIR}}` still resolves to the detected output directory. The root `Caddyfile` copies the template without the fallback and adds:

```caddyfile
handle_errors 404 {
	rewrite * /404.html
	file_server
}
```

When no file matches, `file_server` raises a 404, and `handle_errors` serves `404.html` instead of an empty body. Caddy's `file_server` keeps the error's status code inside `handle_errors`, so the response stays 404. Matching only 404 keeps other errors as Caddy answers them.

The cost is that the template's later changes no longer reach this site: its security headers, proxy trust and compression. The file is short and rarely changes, so owning it is acceptable.

The `Staticfile` existed only to turn off the template's fallback to `/index.html`. Railpack reads its `index_fallback` only to fill that template, so with our own `Caddyfile` it has no effect, and it is removed.

- https://railpack.com/languages/node (static sites, custom Caddyfile, `index_fallback`)
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/Caddyfile.template
- https://github.com/railwayapp/railpack/blob/main/core/providers/node/spa.go (`TemplateFiles` reads `Caddyfile.template` or `Caddyfile`)
- https://github.com/railwayapp/railpack/blob/main/core/generate/template.go
- https://caddyserver.com/docs/caddyfile/directives/handle_errors

## Watch paths

The `web` service watches `/Caddyfile` instead of `/Staticfile`, since a change to it changes what the service serves.
