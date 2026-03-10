import { useEffect, useRef } from "react";
import { Stack, router, useRootNavigationState } from "expo-router";
import { useFonts } from "expo-font";
import * as Notifications from "expo-notifications";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { colors, fontFiles } from "../lib/theme";

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

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  // A tap always opens the inbox. It never starts a UPI app on its own.
  useEffect(() => {
    if (!navigationState?.key) return;

    const openInbox = (response) => {
      const id = response?.notification?.request?.identifier ?? "latest";
      if (handledResponse.current === id) return;
      handledResponse.current = id;
      router.navigate("/sms-payments");
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
