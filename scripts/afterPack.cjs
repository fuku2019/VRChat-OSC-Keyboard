exports.default = async context => {
  await require('./removeLocales.cjs').default(context);
  if (context.electronPlatformName !== 'win32') throw new Error('IME packaging currently supports Windows x64 only');
  const { verifyPackage } = await import('./verify-ime-package.mjs');
  await verifyPackage(context.appOutDir, { development: true });
};
