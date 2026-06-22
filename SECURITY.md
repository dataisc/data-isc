# Security Policy

## Supported versions

Data ISC is under active development. Security fixes are applied to the latest release on the `main` branch.

| Version | Supported |
|---------|-----------|
| latest (`main`) | ✅ |
| older tags | ❌ |

## Reporting a vulnerability

**Please do not report security vulnerabilities through public GitHub issues.**

Instead, use one of the following private channels:

- Open a [private security advisory](https://github.com/dataisc/data-isc/security/advisories/new) (preferred), or
- Email **security@dataisc.dev** with details.

Please include:

- A description of the vulnerability and its impact.
- Steps to reproduce, or a proof-of-concept.
- The affected component (e.g. the `/api/fetch-csv` proxy, scenario import, AI provider handling).
- Any suggested remediation, if you have one.

We aim to acknowledge reports within **72 hours** and to provide a remediation timeline after triage. We'll keep you updated on progress and credit you in the release notes once a fix ships (unless you prefer to remain anonymous).

## Scope notes

A few areas are especially relevant to this project:

- **SSRF surface.** The `/api/fetch-csv` and `/api/fx` proxies make outbound requests on the server's behalf. Private/loopback ranges are blocked — please report any bypass.
- **Client-held API keys.** AI provider keys are stored only in the user's browser and sent directly to the provider, never to our server. Report anything that contradicts this.
- **Model confidentiality.** The projection model runs server-side and only computed output is sent to the client. Report any path that leaks model parameters, growth rates, or scenario coefficients.

Thank you for helping keep Data ISC and its users safe.
