module.exports = {
  expo: {
    name: "App Life Digital",
    slug: "applifedigital",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "automatic",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#1A1A2E"
    },
    assetBundlePatterns: [
      "**/*"
    ],
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.applifedigital.app"
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1A1A2E"
      },
      package: "com.applifedigital.app",
      permissions: [
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "USE_FINGERPRINT"
      ],
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON
    },
    web: {
      favicon: "./assets/favicon.png"
    },
    plugins: [
      "expo-router",
      [
        "expo-notifications",
        {
          "icon": "./assets/notification-icon.png",
          "color": "#1A1A2E",
          "sounds": ["./assets/notification.wav"]
        }
      ]
    ],
    scheme: "applifedigital",
    experiments: {
      typedRoutes: true
    },
    extra: {
      // Usa a mesma base do backend web (NEXT_PUBLIC_API_BASE_URL) para sincronizar web ↔ mobile
      apiBaseUrl: process.env.NEXT_PUBLIC_API_BASE_URL
        || process.env.API_URL
        || process.env.API_URL_WEB
        || "http://192.168.3.8:8000",
      apiUrl: process.env.NEXT_PUBLIC_API_BASE_URL
        || process.env.API_URL
        || "http://192.168.3.8:8000",
      eas: {
        projectId: process.env.EXPO_PROJECT_ID || "configure-with-eas-cli"
      }
    }
  }
};
