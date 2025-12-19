const apiBaseUrl =
  process.env.EXPO_PUBLIC_API_URL
  || process.env.API_URL
  || "https://api.lifeservicos.com"; // API de produção (ajuste EXPO_PUBLIC_API_URL/API_URL para dev)

module.exports = {
  expo: {
    name: "Digital",
    slug: "applifedigital",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "automatic",
    icon: "./assets/lifeapp.png",
    splash: {
      image: "./assets/lifeapps.png",
      resizeMode: "contain",
      backgroundColor: "#121212"
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
      icon: "./assets/lifeapp.png",
      adaptiveIcon: {
        foregroundImage: "./assets/lifeapp.png",
        backgroundColor: "#121212"
      },
      package: "com.applifedigital.app",
      permissions: [
        "CAMERA",
        "RECEIVE_BOOT_COMPLETED",
        "POST_NOTIFICATIONS",
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
          "color": "#121212"
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
