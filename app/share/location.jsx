import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router } from "expo-router";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import PixelIcon from "../../components/PixelIcon";
import RecipientPicker from "../../components/RecipientPicker";
import { formatAge } from "../../lib/geo";
import { newSessionId } from "../../lib/geo";
import { readFix, requestLocationAccess, shareLocation } from "../../lib/locationShare";
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
  const [pending, setPending] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState(null);

  const timer = useRef(null);
  const recipientRef = useRef(null);
  const intervalRef = useRef(60);
  const runningRef = useRef(false);
  const runId = useRef(0);
  const sessionRef = useRef(newSessionId());

  recipientRef.current = recipient;
  intervalRef.current = intervalSec;

  const sendFix = useCallback(async () => {
    const address = recipientRef.current?.number;
    if (!address) return false;

    setPending(true);
    try {
      const fix = await readFix();
      const result = await shareLocation({
        address,
        session: sessionRef.current,
        fix,
      });

      if (result.sent) {
        setLast({ fix, at: Date.now(), parts: result.parts });
        setSentCount((count) => count + 1);
        setError(null);
        return true;
      }

      setError(result.reason ?? "The message did not leave the phone.");
      return false;
    } catch (failure) {
      setError(failure?.message ?? "Could not read your location.");
      return false;
    } finally {
      setPending(false);
    }
  }, []);

  const stop = useCallback(() => {
    runId.current += 1;
    runningRef.current = false;
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
    setRunning(false);
  }, []);

  useEffect(() => stop, [stop]);

  const start = async () => {
    if (!recipient?.number || running || runningRef.current || starting) return;
    setError(null);
    setStarting(true);
    const run = ++runId.current;

    try {
      const access = await requestLocationAccess();
      if (runId.current !== run) return;
      if (!access.granted) {
        setError(access.reason);
        return;
      }

      const allowed = hasSendPermission() || (await requestSmsPermissions());
      if (runId.current !== run) return;
      if (!allowed) {
        setError("SMS permission is needed to send location updates.");
        return;
      }

      sessionRef.current = newSessionId();
      setSentCount(0);
      runningRef.current = true;
      setRunning(true);

      await sendFix();
      if (!runningRef.current || runId.current !== run) return;
      timer.current = setInterval(sendFix, intervalRef.current * 1000);
    } catch (failure) {
      setError(failure?.message ?? "Could not start sharing.");
    } finally {
      setStarting(false);
    }
  };

  const changeInterval = (seconds) => {
    setIntervalSec(seconds);
    intervalRef.current = seconds;

    if (running && timer.current) {
      clearInterval(timer.current);
      timer.current = setInterval(sendFix, seconds * 1000);
    }
  };

  const goBack = () => {
    stop();
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
            {pending ? (
              <ActivityIndicator size="small" color={colors.muted} />
            ) : (
              <PixelIcon
                name="location"
                size={16}
                color={running ? colors.text : colors.muted}
              />
            )}
            <Text style={type.bodyMedium}>
              {running
                ? `Sharing every ${intervalRef.current} s`
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
          One SMS per update, so every ping costs a message. Android pauses the
          timer when the screen is off; keep this screen open while tracking.
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
