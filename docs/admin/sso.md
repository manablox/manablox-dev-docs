---
title: 'Single sign-on'
description: 'OIDC and SAML identity providers for the admin sign-in: setting them up, the URLs an identity provider needs, email domains, requiring single sign-on, accounts created at the first sign-in, and how it meets two-factor authentication.'
---

Single sign-on lets people sign in to the admin through their organisation's identity
provider (IdP) instead of a Manablox password. Manablox speaks OpenID Connect (OIDC) and
SAML 2.0, on better-auth's `sso` plugin. A superadmin sets the providers up under
**Settings > Security > Single sign-on**; the [`sso` feature](../configuration/controls.md#single-sign-on)
gates all of it.

Each provider has:

- **Email domains**: addresses at these domains, and at their subdomains, belong to it. A domain belongs to one provider only (`sso.domain.taken`).
- **Require single sign-on**: password sign-in and password resets are refused for its domains.
- **List it on the sign-in page**: a *Continue with ...* button that works without typing an address.
- **Create an account at the first sign-in**, and the spaces and roles such accounts join.

## The URLs an identity provider needs

The provider dialog shows these to copy. They start with better-auth's base URL, which is
`auth.baseUrl` (by default `server.publicUrl`) followed by `/api/auth`:

| Protocol | What | URL |
| --- | --- | --- |
| OIDC | Redirect URI (callback) | `<base>/sso/callback/<provider id>` |
| SAML | Assertion consumer service (ACS), HTTP-POST | `<base>/sso/saml2/sp/acs/<provider id>` |
| SAML | Service provider metadata | `<base>/sso/saml2/sp/metadata?providerId=<provider id>` |
| SAML | SP entity id (audience) | The metadata URL, unless the provider sets another |

For SAML the dialog also shows the provider's SP certificate, with a copy button, once the
provider is saved. The metadata URL publishes it too.

The provider id is part of these URLs, so it is fixed once the provider is added.

## Setting up an OIDC provider

1. At the IdP, create a web application (a confidential client) with the redirect URI above and the scopes `openid`, `email` and `profile`.
2. In **Settings > Security**, click **Add provider**, keep *OpenID Connect*, and enter a name, a provider id and the email domains.
3. Enter the **Issuer URL**, the **Client id** and the **Client secret** from the IdP. **Test connection** fetches the discovery document to check the issuer.
4. Save. Saving fetches `<issuer>/.well-known/openid-configuration` (or the **Discovery URL** when given) and stores the authorization, token, JWKS and userinfo endpoints it names.

Examples of issuer URLs:

| IdP | Issuer URL |
| --- | --- |
| Microsoft Entra ID | `https://login.microsoftonline.com/<tenant id>/v2.0` |
| Google Workspace | `https://accounts.google.com` |
| Okta | `https://<your org>.okta.com` |
| Keycloak | `https://<host>/realms/<realm>` |

Manablox signs in with the authorization code flow and PKCE, and authenticates to the
token endpoint with `client_secret_basic` or `client_secret_post`, whichever the IdP
offers. An IdP that only accepts `private_key_jwt` is refused when saving. The address and
name come from the verified ID token, or from the userinfo endpoint when the IdP has one.

The IdP's endpoints must be on publicly routable hosts. An IdP on an internal network
(a private address or a name that resolves to one) is refused
(`sso.discovery.failed`) unless its origin is listed in `auth.trustedOrigins`, which the
stock API image fills from [`CORS_ORIGINS`](../configuration/environment.md).

## Setting up a SAML provider

1. At the IdP, create a SAML application with the ACS URL and the SP entity id above (or upload the metadata URL). Send the address as the NameID in email format, or as an attribute.
2. In **Settings > Security**, click **Add provider**, pick *SAML 2.0*, and enter a name, a provider id and the email domains.
3. Enter the IdP's **sign-in URL** (the SSO URL, HTTP-Redirect binding), its **entity id** and its **signing certificate** (PEM, or just the base64 body). **Check certificate** shows who it was issued to and until when it is valid.
4. Optionally name the **Email attribute** and **Name attribute** when the IdP does not send `email` and `displayName`.

Assertions must be signed with that certificate; the metadata says so
(`WantAssertionsSigned="true"`). Manablox checks the signature, the audience, the
recipient and destination, the time window (`NotBefore`, `NotOnOrAfter`) and that each
assertion is used once. Single logout is not supported: signing out of Manablox does not
sign out at the IdP, and the reverse.

### The SP key pair

Saving a SAML provider for the first time generates a key pair for it: an RSA 2048 key and
a self-signed certificate, valid for ten years. A provider saved without one gets one the
next time it is saved. The same key pair signs authentication requests and
decrypts assertions, so the IdP needs one certificate. The metadata publishes it as the
signing certificate (`KeyDescriptor use="signing"`) and, when encrypted assertions are
required, also as the encryption certificate (`use="encryption"`).

The private key is stored encrypted with the instance secret, like the OIDC client secret,
and never leaves the server: the API, the admin and the audit log show the certificate only.

**Regenerate SP keys** in the provider dialog replaces the key pair at once. The old key is
not kept: until the IdP has the new certificate (upload the metadata again, or paste the
certificate), signed requests are refused by the IdP and encrypted assertions cannot be
read. Regenerate when the key may have leaked or the certificate is about to expire, at a
time when you can update the IdP right away. It is audited as `ssoProvider.update` with
`spKeysRegenerated: true`.

### Options

| Option | What it does |
| --- | --- |
| **Sign authentication requests** | AuthnRequests are signed with the SP key (RSA-SHA256, HTTP-Redirect binding); the metadata says `AuthnRequestsSigned="true"`. Turn it on when the IdP requires signed requests |
| **Require encrypted assertions** | The metadata offers the SP certificate for encryption and Manablox decrypts assertions with the SP key. A response with an unencrypted assertion is refused (`saml_error`). Off, the metadata offers no encryption certificate and assertions must be unencrypted |
| **Accept IdP-initiated sign-in** | Responses the IdP sends without a sign-in started at Manablox (from the IdP's portal) are accepted. Off, they are refused with `unsolicited_response` |
| **Landing page** | The admin path an IdP-initiated sign-in lands on; `/` by default. It must start with `/` and stay on the admin's origin (`sso.landingPath.invalid`) |

### IdP-initiated sign-in

With **Accept IdP-initiated sign-in** on, a response without `InResponseTo` is checked like
any other (signature, audience, recipient and destination, and that its assertion was not
used before) and must also carry a validity window (`NotBefore` or `NotOnOrAfter`). A
response that answers a sign-in Manablox started is still matched to that request. The
account rules below apply unchanged. The browser then goes to the landing page, below the
admin URL (`server.adminUrl`), which must be one of `auth.trustedOrigins`.

Leave the IdP's default RelayState empty: a RelayState Manablox did not issue is refused
(`invalid_state`). A refused IdP-initiated response comes back to the landing page with
`?error=<code>`, or to the sign-in page when the provider does not accept IdP-initiated
sign-in. IdP-initiated sign-in is weaker than a sign-in started at Manablox (an attacker
who gets hold of a fresh response can use it once, before its owner does), so turn it on only
when the IdP's portal needs it.

## Signing in

On the sign-in page, a typed address is checked against the providers' domains after a
short pause (`POST /api/auth/sso/lookup`). When a provider serves it, a *Continue with ...*
button appears; when the provider requires single sign-on, the password field goes away and
**Sign in** leaves for the IdP. Providers listed on the sign-in page are there from the start
(`GET /api/auth/sso/sign-in-providers`). Both answer nothing while the `sso` feature is off.

The button calls better-auth's `POST /api/auth/sign-in/sso` with the provider id and sends
the browser to the IdP. Coming back, better-auth checks the answer and signs in one
account:

1. The account already linked to that IdP identity.
2. Otherwise the account with the same address, which gets linked (audited as `user.linkSso`, and the address counts as confirmed). The provider vouches for addresses at its domains, so no confirmation mail is needed.
3. Otherwise a new account, when the provider creates accounts: instance role *Member*, the address confirmed, the provider's spaces and roles granted. It is audited as `user.create` with `via: 'sso'`, raises the `user.created` [control event](../reference/control-api.md#events), and takes a seat of `limits.seats`.

A sign-in that is refused comes back to the login page with `?error=<code>`, the page
explains it, and it is audited as `session.signInFailed` with the reason:

| Code | Why |
| --- | --- |
| `sso_domain` | The IdP answered with an address outside the provider's domains |
| `sso_no_account` | No account has the address, and the provider creates none |
| `sso_seats` | A new account would pass a hard `seats` limit, of the instance or of a space it would join |
| `sso_banned` | The account is banned |
| `sso_disabled` | The `sso` feature is off |
| `sso_unknown` | The provider was removed meanwhile |
| `unsolicited_response` | SAML: an IdP-initiated response for a provider that does not accept them |
| `replay_detected` | SAML: the assertion was used before |
| `invalid_saml_response` | SAML: wrong audience, recipient or destination, or a response to an unknown or expired request |
| `saml_error` | SAML: the response could not be read, for example an unencrypted assertion where encryption is required |

## Requiring single sign-on

With **Require single sign-on** on, for the addresses of the provider's domains:

- `POST /api/auth/sign-in/email` answers 403 with the code `SSO_REQUIRED` (`auth.sso.required`), before the password is checked.
- `POST /api/auth/request-password-reset` answers the same, and so does redeeming a reset or set-password link (`reset-password`) for such an account.
- Sessions that exist stay valid; API keys are separate credentials and keep working.

It applies only while the `sso` feature is on. Switched off, those addresses can use their
passwords, and reset them, again.

## Two-factor authentication

Single sign-on is not asked for a Manablox two-factor code: the IdP handles the second
factor, and the sign-in never passes through the password step that asks for it. The
superadmin's [two-factor policy](./users-and-roles.md#two-factor-authentication) covers
password sign-ins only. A session that came through single sign-on is marked
(`sessions.sso_provider_id`) and is never held back for enrolment, even for an account the
policy covers. The same account signing in with its password is covered like any other.

## Secrets

The OIDC client secret is stored encrypted with the instance secret (AES-256-GCM, as AI keys
and credentials are), shown only by its last four characters, and decrypted only
when better-auth talks to the IdP. Leave the field empty when editing to keep it. Losing
`auth.secret` loses the stored client secrets; enter them again. A SAML provider's SP
private key is stored the same way; after losing `auth.secret`, regenerate the SP keys and
give the IdP the new certificate. The IdP certificate is public and is stored as it is.

## Removing a provider

Removing a provider unlinks every account from it. The accounts and their sessions stay.
Accounts it created have no password; while their domain does not require single sign-on,
they can set one with **Forgot password?**, or they sign in through a new provider with
their address.

## API

| Procedure | What it does |
| --- | --- |
| `sso.list` | `{ providers, authBaseUrl }`; each provider with its domains, settings, URLs and SP certificate, never the client secret or the SP private key |
| `sso.create` | `providerId`, `name`, `domains`, one of `oidc` or `saml`, `requireSso`, `showOnSignIn`, `createAccounts`, `defaultGrants`. `saml` also takes `signRequests`, `encryptAssertions`, `idpInitiated` and `landingPath` |
| `sso.update` | The same without `providerId`; an empty `oidc.clientSecret` keeps the stored one, and the SP key pair is kept |
| `sso.regenerateKeys` | `id`: a new SP key pair for a SAML provider |
| `sso.delete` | Removes the provider and unlinks its accounts |
| `sso.test` | `oidc: { issuer, discoveryEndpoint? }` fetches the discovery document; `saml: { certificate }` reads the certificate |

All of them are superadmin-only; every one except `list` and `delete` needs the `sso`
feature. Changes are audited as `ssoProvider.create`, `ssoProvider.update` and
`ssoProvider.delete`. better-auth's own provider endpoints (`/sso/register`,
`/sso/providers`, `/sso/get-provider`, `/sso/update-provider`, `/sso/delete-provider`)
are switched off.
