import { useCallback, useEffect, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import PixelIcon from "../../components/PixelIcon";
import RecipientPicker from "../../components/RecipientPicker";
import { formatAge, newSessionId } from "../../lib/geo";
import { requestLocationAccess } from "../../lib/locationShare";
import {
  getLocationShareState,
  isLocationShareRunning,
  startLocationShare,
  stopLocationShare,
} from "../../lib/locationTask";
import { hasSendPermission, requestSmsPermissions } from "../../lib/sms";
import { colors, radius, space, type } from "../../lib/theme";

const INTERVALS = [
  { seconds: 30, label: "30 s" },
  { seconds: 60, label: "1 min" },
  { seconds: 300, label: "5 min" },
];

export default function LocationShareScreen() {
  const [recipient, setRecipient] = useState(null);
  const [intervalSec, setIntervalSec] = useState(60);
  const [running, setRunning] = useState(false);
  const [sentCount, setSentCount] = useState(0);
  const [last, setLast] = useState(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const mounted = useRef(true);
  const poll = useRef(null);
  const session = useRef(null);

  const refresh = useCallback(() => {
    if (!mounted.current) return;

    const state = getLocationShareState();
    setSentCount(state.sentCount);
    setLast(
      state.lastFix
        ? { fix: state.lastFix, at: state.lastAt ?? Date.now() }
        : null,
    );
    setError(state.error || null);
    if (!state.active) setRunning(false);
  }, []);

  const stopPolling = useCallback(() => {
    if (poll.current) {
      clearInterval(poll.current);
      poll.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    if (poll.current) return;
    poll.current = setInterval(refresh, 2000);
  }, [refresh]);

  // The foreground service may still be running from a previous session, or
  // from before the app was killed. Reflect that instead of showing "stopped".
  useEffect(() => {
    mounted.current = true;
    let cancelled = false;

    isLocationShareRunning()
      .then((active) => {
        if (cancelled || !active) return;

        const state = getLocationShareState();
        if (state.address) {
          setRecipient({ number: state.address, name: null });
        }
        session.current = state.session;
        setIntervalSec(state.intervalSec);
        setSentCount(state.sentCount);
        setRunning(true);
        setError(state.error);
        refresh();
        startPolling();
      })
      .catch(() => {});

    return () => {
      cancelled = true;
      mounted.current = false;
      stopPolling();
    };
  }, [refresh, startPolling, stopPolling]);

  const start = async () => {
    if (!recipient?.number || running || starting) return;

    setError(null);
    setStarting(true);

    try {
      const access = await requestLocationAccess();
      if (!access.granted) {
        setError(access.reason);
        return;
      }

      const allowed = hasSendPermission() || (await requestSmsPermissions());
      if (!allowed) {
        setError("SMS permission is needed to send location updates.");
        return;
      }

      session.current = newSessionId();
      await startLocationShare({
        address: recipient.number,
        session: session.current,
        intervalSec,
        reset: true,
      });

      setRunning(true);
      setSentCount(0);
      setLast(null);
      startPolling();
    } catch (failure) {
      setError(failure?.message ?? "Could not start sharing.");
    } finally {
      setStarting(false);
    }
  };

  const stop = async () => {
    stopPolling();
    setRunning(false);
    await stopLocationShare();
    refresh();
  };

  const changeInterval = async (seconds) => {
    setIntervalSec(seconds);

    if (!running || !recipient?.number || !session.current) return;

    try {
      await startLocationShare({
        address: recipient.number,
        session: session.current,
        intervalSec: seconds,
        reset: false,
      });
    } catch (failure) {
      setError(failure?.message ?? "Could not change the interval.");
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Live location" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <RecipientPicker
          selected={recipient}
          onSelect={setRecipient}
          disabled={running}
        />

        <View style={styles.block}>
          <Text style={type.label}>EVERY</Text>
          <View style={styles.intervals}>
            {INTERVALS.map((option) => {
              const active = option.seconds === intervalSec;
              return (
                <Text
                  key={option.seconds}
                  onPress={() => changeInterval(option.seconds)}
                  accessibilityRole="button"
                  accessibilityLabel={`Send every ${option.label}`}
                  style={[
                    type.button,
                    styles.interval,
                    active && styles.intervalActive,
                  ]}
                >
                  {option.label}
                </Text>
              );
            })}
          </View>
        </View>

        <View style={styles.status}>
          <View style={styles.statusRow}>
            <PixelIcon
              name="location"
              size={16}
              color={running ? colors.text : colors.muted}
            />
            <Text style={type.bodyMedium}>
              {running
                ? `Sharing every ${intervalSec} s`
                : "Not sharing"}
            </Text>
          </View>

          <Text style={type.muted}>
            {sentCount === 0
              ? "No updates sent yet."
              : `${sentCount} update${sentCount === 1 ? "" : "s"} sent.`}
          </Text>

          {last ? (
            <Text style={type.muted}>
              {last.fix.lat.toFixed(5)}, {last.fix.lon.toFixed(5)} · ±
              {Math.round(last.fix.accuracy)} m · {formatAge(Date.now() - last.at)}
            </Text>
          ) : null}

          {error ? <Text style={[type.muted, styles.error]}>{error}</Text> : null}
        </View>

        <Text style={[type.muted, styles.note]}>
          Sending continues with the screen off, using an Android foreground
          service and the ongoing notification. Each update costs one SMS.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        {running ? (
          <AppButton label="Stop sharing" variant="outline" onPress={stop} />
        ) : (
          <AppButton
            label="Start sharing"
            onPress={start}
            loading={starting}
            disabled={!recipient?.number}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    padding: space.lg,
    gap: space.xl,
  },
  block: {
    gap: space.sm,
  },
  intervals: {
    flexDirection: "row",
    gap: space.sm,
  },
  interval: {
    flex: 1,
    textAlign: "center",
    paddingVertical: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    color: colors.muted,
  },
  intervalActive: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
    color: colors.accentInk,
  },
  status: {
    gap: space.sm,
    padding: space.lg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  error: {
    color: colors.danger,
  },
  note: {
    paddingBottom: space.lg,
  },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
