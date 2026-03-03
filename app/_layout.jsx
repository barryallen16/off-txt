import { Slot, Stack } from "expo-router";
import { AppRegistry } from "react-native";
import { RNAndroidNotificationListenerHeadlessJsName } from "react-native-android-notification-listener";
import * as SQLite from "expo-sqlite";
import * as Notifications from "expo-notifications";

// Initialize the database for background use
const db = SQLite.openDatabaseSync("payments.db");

// 1. Headless Background Interceptor
const headlessNotificationListener = async ({ notification }) => {
  if (notification) {
    try {
      const payload = JSON.parse(notification);
      const text = payload.text || "";

      // Feature 1: Filter message string for specific prefix ":txt "
      if (text.startsWith(":txt ")) {
        const upiRegex = /(upi:\/\/pay\?[^\s]+)/i;
        const match = text.match(upiRegex);

        if (match && match[0]) {
          const upiLink = match[0];

          // Feature 2: Save metadata inside SQLite database cleanly
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

          // Feature 3: Schedule a local push notification immediately
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

// Register background hook service directly with the OS
AppRegistry.registerHeadlessTask(
  RNAndroidNotificationListenerHeadlessJsName,
  () => headlessNotificationListener
);

export default function RootLayout() {
  return (
    <Stack>
      <Stack.Screen name="index" options={{ title: "Scanner" }} />
      <Stack.Screen name="sms-payments" options={{ title: "Offline Inbox" }} />
    </Stack>
  );
}