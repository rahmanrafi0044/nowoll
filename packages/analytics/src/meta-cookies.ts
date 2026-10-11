// Meta's own cookies (step 39b), read in the browser at checkout and checked
// again by the API — formats from docs/integrations/meta.md (fbp and fbc).

/** _fbp: fb.1.<ms>.<random digits>. */
export const FBP_PATTERN = /^fb\.[0-9]\.[0-9]{10,16}\.[0-9]{1,20}$/
/** _fbc: fb.1.<ms>.<fbclid> (fbclid: letters, digits, _ and -; case-sensitive). */
export const FBC_PATTERN = /^fb\.[0-9]\.[0-9]{10,16}\.[A-Za-z0-9_-]{1,500}$/

/** The _fbp / _fbc values from a document.cookie string — only if they look exactly right. */
export function readMetaCookies(cookieString: string): { fbp?: string; fbc?: string } {
  const get = (name: string) =>
    cookieString
      .split(';')
      .map((c) => c.trim())
      .find((c) => c.startsWith(`${name}=`))
      ?.slice(name.length + 1)
  const fbp = get('_fbp')
  const fbc = get('_fbc')
  return {
    ...(fbp && FBP_PATTERN.test(fbp) && { fbp }),
    ...(fbc && FBC_PATTERN.test(fbc) && { fbc }),
  }
}
