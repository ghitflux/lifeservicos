const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL
  || process.env.API_URL
  || "http://0.0.0.0:8000"; // API do life-system (ajuste EXPO_PUBLIC_API_URL para o IP acessivel)

module.exports = {
  expo: {
    name: "App Life Digital",
    slug: "applifedigital",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/icon.png",
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
      bundleIdentifier: "com.applifedigital.app",
      infoPlist: {
        NSCameraUsageDescription: "Precisamos acessar sua câmera para enviar documentos e fotos.",
      }
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#1A1A2E"
      },
      package: "com.applifedigital.app",
      permissions: [
        "CAMERA",
        "RECEIVE_BOOT_COMPLETED",
        "VIBRATE",
        "USE_FINGERPRINT"
      ]
    },
    web: {},
    plugins: [
      "expo-router",
      "expo-camera",
      "expo-secure-store",
      "expo-document-picker",
      "expo-image-picker",
      [
        "expo-notifications",
        {
          "color": "#1A1A2E"
        }
      ]
    ],
    scheme: "applifedigital",
    experiments: {
      typedRoutes: true
    },
    extra: {
      // Base da API do life-system (defina EXPO_PUBLIC_API_URL / API_URL no build ou expo start)
      apiBaseUrl,
      apiUrl: apiBaseUrl,
      eas: {
        projectId: "fab466c5-5cf6-4763-932d-673443916eb2"
      }
    }
  }
};
