import { useEffect, useRef } from "react";
import { AppState } from "react-native";
import { Stack, router, useRootNavigationState } from "expo-router";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colors, fontFiles } from "../lib/theme";
import { getMeta } from "../lib/db";
import { syncInbox } from "../lib/syncInbox";

SplashScreen.preventAutoHideAsync().catch(() => {});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(fontFiles);
  const navigationState = useRootNavigationState();
  const handledResponse = useRef(null);
  const checkedOnboarding = useRef(false);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // Ask for the permissions the app cannot work without on the very first
  // launch, instead of letting the user discover them screen by screen.
  useEffect(() => {
    if (!navigationState?.key) return;
    if (!fontsLoaded && !fontError) return;
    if (checkedOnboarding.current) return;
    checkedOnboarding.current = true;

    try {
      if (getMeta("onboarding_complete") !== "1") {
        router.replace("/permissions");
      }
    } catch {
      // If the flag cannot be read, do not block the app.
    }
  }, [navigationState?.key, fontsLoaded, fontError]);

  // A tap always opens the inbox. It never starts a UPI app on its own.
  useEffect(() => {
    if (!navigationState?.key) return;

    const openInbox = (response) => {
      // Do not let a stale notification skip the first-run setup.
      try {
        if (getMeta("onboarding_complete") !== "1") return;
      } catch {
        return;
      }

      const id = response?.notification?.request?.identifier ?? "latest";
      if (handledResponse.current === id) return;
      handledResponse.current = id;

      const transferId =
        response?.notification?.request?.content?.data?.transferId;
      if (transferId != null) router.navigate(`/transfers/${transferId}`);
      else router.navigate("/sms-payments");
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(openInbox);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!response) return;
        const delivered = Number(response.notification.date) * 1000;
        if (Date.now() - delivered < 60_000) openInbox(response);
      })
      .catch(() => {});

    return () => subscription.remove();
  }, [navigationState?.key]);

  // The notification path can only see what Android puts in the notification.
  // Reading the inbox fills in the rest of a multipart transfer.
  useEffect(() => {
    if (!navigationState?.key) return;

    syncInbox().catch(() => {});
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") syncInbox().catch(() => {});
    });

    return () => subscription.remove();
  }, [navigationState?.key]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: colors.bg },
        }}
      />
    </>
  );
}
