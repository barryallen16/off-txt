import { useCallback, useEffect, useRef, useState } from "react";
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
  const checkedOnboarding = useRef(false);
  const [appActive, setAppActive] = useState(
    AppState.currentState !== "background",
  );
  const ready =
    Boolean(navigationState?.key) &&
    appActive &&
    (Boolean(fontsLoaded) || Boolean(fontError));
  const readyRef = useRef(ready);
  const pendingRoute = useRef(null);
  const handledNotification = useRef(null);

  const flushPendingRoute = useCallback(() => {
    if (!readyRef.current) return;

    const route = pendingRoute.current;
    if (!route) return;

    // Never let a stale notification skip the first-run setup.
    try {
      if (getMeta("onboarding_complete") !== "1") {
        pendingRoute.current = null;
        return;
      }
    } catch {
      return;
    }

    pendingRoute.current = null;
    Notifications.clearLastNotificationResponseAsync().catch(() => {});

    // Wait for the current render and the focus change to settle. Pushing while
    // the app is still coming to the foreground can drop the navigation.
    setTimeout(() => {
      router.navigate(route);
    }, 60);
  }, []);

  useEffect(() => {
    readyRef.current = ready;
    if (ready) flushPendingRoute();
  }, [ready, flushPendingRoute]);

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      setAppActive(state === "active");
    });
    return () => subscription.remove();
  }, []);

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
  // The route is queued until navigation and the app are both ready, because a
  // response can arrive before the navigator mounts on a cold start.
  useEffect(() => {
    const routeFor = (response) => {
      const transferId =
        response?.notification?.request?.content?.data?.transferId;
      return transferId != null ? `/transfers/${transferId}` : "/sms-payments";
    };

    const queue = (response) => {
      if (!response) return;

      const id = response?.notification?.request?.identifier ?? null;
      if (id && handledNotification.current === id) return;
      handledNotification.current = id;

      pendingRoute.current = routeFor(response);
      flushPendingRoute();
    };

    const subscription =
      Notifications.addNotificationResponseReceivedListener(queue);

    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (response) queue(response);
      })
      .catch(() => {});

    return () => subscription.remove();
  }, [flushPendingRoute]);

  // Notification access can be off, or a messaging app may post no
  // notification at all. Poll the SMS inbox while the app is open so those
  // requests still show up without a restart.
  useEffect(() => {
    if (!navigationState?.key) return undefined;

    let timer = null;
    const tick = () => {
      syncInbox().catch(() => {});
    };
    const start = () => {
      tick();
      if (timer) return;
      timer = setInterval(tick, 10_000);
    };
    const stop = () => {
      if (!timer) return;
      clearInterval(timer);
      timer = null;
    };

    start();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") start();
      else stop();
    });

    return () => {
      stop();
      subscription.remove();
    };
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
