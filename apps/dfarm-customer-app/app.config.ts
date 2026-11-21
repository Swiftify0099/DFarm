import { ExpoConfig, ConfigContext } from 'expo/config';

export default ({ config }: ConfigContext): ExpoConfig => {
  const isProduction =
    process.env.APP_ENV === 'production' ||
    process.env.NODE_ENV === 'production' ||
    process.env.EAS_BUILD_PROFILE === 'production';

  return {
    ...config,
    name: 'DFarm Customer',
    slug: config.slug || 'dfarm-customer-app',
    android: {
      ...config.android,
      package: 'com.dfarm.customer',
      // Cleartext HTTP (usesCleartextTraffic) is strictly disabled in production builds
      // to mandate HTTPS (TLS 1.3). It is only enabled during development for Android emulator
      // loopback (10.0.2.2:4000) and local network backend servers.
      ...({ usesCleartextTraffic: !isProduction } as any),
    },
  };
};
