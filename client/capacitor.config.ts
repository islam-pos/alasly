import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.alasly.autocare',
  appName: 'المحترف AutoCare',
  webDir: 'dist',
  backgroundColor: '#f8fafc',
  android: {
    allowMixedContent: false,
  },
  ios: {
    contentInset: 'automatic',
  },
};

export default config;
