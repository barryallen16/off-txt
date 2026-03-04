const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withAndroidAllowBackup(config) {
  return withAndroidManifest(config, async (config) => {
    const androidManifest = config.modResults.manifest;
    
    // Ensure tools namespace exists
    if (!androidManifest.$["xmlns:tools"]) {
      androidManifest.$["xmlns:tools"] = "http://schemas.android.com/tools";
    }

    const application = androidManifest.application[0];

    // Force allowBackup to false
    application.$["android:allowBackup"] = "false";

    // Inject tools:replace to resolve the conflict
    const existingReplace = application.$["tools:replace"] || "";
    if (!existingReplace.includes("android:allowBackup")) {
      application.$["tools:replace"] = existingReplace
        ? `${existingReplace},android:allowBackup`
        : "android:allowBackup";
    }

    return config;
  });
};