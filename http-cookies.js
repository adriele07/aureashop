function setCookie(res, name, value, maxAge = 2592000, attrs = 'HttpOnly') {
  const cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAge}; ${attrs}`;
  const current = res.getHeader('Set-Cookie');
  const cookies = current === undefined ? [] : Array.isArray(current) ? current : [current];
  const remaining = cookies.filter(value => !String(value).startsWith(`${name}=`));
  res.setHeader('Set-Cookie', [...remaining, cookie]);
}

module.exports = { setCookie };
