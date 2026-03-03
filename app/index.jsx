import "expo-router/entry"; // This tells Expo Router to take over the UI
import { AppRegistry } from "react-native";
import RNAndroidNotificationListener, { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";

const headlessNotificationListener = async ({ notification }) => {
  // This notification object is delivered as a JSON string
  if (notification) {
    try {
      const payload = JSON.parse(notification);
      const text = payload.text || "";

      if (text.startsWith(":txt ")) {
        const upiRegex = /(upi:\/\/pay\?[^\s]+)/i;
        const match = text.match(upiRegex);

        if (match && match[0]) {
          const upiLink = match[0];

          // Safely initialize DB in the background
          const db = SQLite.openDatabaseSync("payments.db");
          db.execSync(`
            CREATE TABLE IF NOT EXISTS received_payments (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              original_text TEXT,
              upi_link TEXT,
              received_at DATETIME DEFAULT CURRENT_TIMESTAMP
            );
          `);
          
          db.runSync(
            "INSERT INTO received_payments (original_text, upi_link) VALUES (?, ?)",
            [text, upiLink]
          );

          // Trigger local push notification
          await Notifications.scheduleNotificationAsync({
            content: {
              title: "💳 Offline Payment Intercepted",
              body: "Tap to review and settle the payment request.",
              data: { url: upiLink },
            },
            trigger: null,
          });
        }
      }
    } catch (e) {
      console.error("Background text handler crash:", e);
    }
  }
};

// Register background hook service directly with the OS using the required strict naming
AppRegistry.registerHeadlessTask(
  RNAndroidNotificationListenerHeadlessJsName,
  () => headlessNotificationListener
);