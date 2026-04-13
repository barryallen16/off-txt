import { useEffect, useRef, useState } from "react";
import {
  AppState,
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router } from "expo-router";
import QRCode from "react-native-qrcode-svg";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import Loading from "../../components/Loading";
import PixelIcon from "../../components/PixelIcon";
import RecipientPicker from "../../components/RecipientPicker";
import { classifyQr, normaliseQr, summariseQr } from "../../lib/qr";
import { ensureSendPermission, sendParts } from "../../lib/sms";
import { KIND, encodeTransfer } from "../../lib/transfer";
import { colors, radius, space, type } from "../../lib/theme";

export default function QrShareScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [mode, setMode] = useState("scan");
  const [text, setText] = useState("");
  const [recipient, setRecipient] = useState(null);
  const [sending, setSending] = useState(false);
  const [askingCamera, setAskingCamera] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState(null);
  const scanLock = useRef(false);

  const check = normaliseQr(text);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") getPermission().catch(() => {});
    });
    return () => subscription.remove();
  }, [getPermission]);

  const askCamera = async () => {
    setAskingCamera(true);
    try {
      if (permission?.canAskAgain === false) {
        await Linking.openSettings();
      } else {
        await requestPermission();
      }
    } catch {
      // Leave the button available if settings cannot open.
    } finally {
      setAskingCamera(false);
    }
  };

  const onScan = ({ data }) => {
    // The camera takes a few frames to unmount. Ignore extra callbacks from
    // the same code so the review state is not written twice.
    if (scanLock.current) return;
    scanLock.current = true;

    setText(data ?? "");
    setMode("review");
    setSent(false);
    setError(null);
  };

  const send = async () => {
    if (!check.valid || !recipient?.number || sending) return;

    setSending(true);
    setError(null);

    try {
      if (!(await ensureSendPermission())) {
        setError("SMS permission is needed to send silently.");
        return;
      }

      const { parts } = encodeTransfer(KIND.QR, check.text);
      const result = await sendParts(recipient.number, parts);
      if (result.sent) {
        setSent(true);
      } else {
        setError(result.reason ?? "The message did not leave the phone.");
      }
    } catch (failure) {
      setError(failure?.message ?? "Sending failed.");
    } finally {
      setSending(false);
    }
  };

  const reset = () => {
    scanLock.current = false;
    setText("");
    setMode("scan");
    setSent(false);
    setError(null);
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/share");
  };

  const scanner = () => {
    if (!permission) {
      return (
        <View style={styles.viewfinder}>
          <Loading label="Checking camera" style={styles.fill} />
        </View>
      );
    }
    if (!permission.granted) {
      return (
        <View style={[styles.viewfinder, styles.centered]}>
          <PixelIcon name="qr" size={24} color={colors.muted} />
          <Text style={[type.muted, styles.center]}>
            Camera access is needed to read a QR code.
          </Text>
          <AppButton
            label={
              permission.canAskAgain === false ? "Open settings" : "Allow camera"
            }
            loading={askingCamera}
            onPress={askCamera}
          />
        </View>
      );
    }

    return (
      <View style={styles.viewfinder}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={mode === "scan" ? onScan : undefined}
          onMountError={(event) =>
            setError(
              event?.message ||
                "Camera could not start. Try reopening this screen.",
            )
          }
        />
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="QR code" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {mode === "review" && check.valid ? (
          <View style={styles.review}>
            <View style={styles.codeBox}>
              <QRCode
                value={check.text}
                size={180}
                color={colors.bg}
                backgroundColor="#ffffff"
              />
            </View>
            <Text style={type.label}>{classifyQr(check.text).toUpperCase()}</Text>
            <Text style={[type.body, styles.break]}>{summariseQr(check.text)}</Text>
          </View>
        ) : null}

        {mode === "review" && text.length > 0 && !check.valid ? (
          <Text style={[type.muted, styles.error]}>{check.reason}</Text>
        ) : null}

        {mode === "manual" ? (
          <View style={styles.manual}>
            <Text style={type.label}>CODE TEXT</Text>
            <TextInput
              value={text}
              onChangeText={(value) => {
                setText(value);
                setSent(false);
                setError(null);
              }}
              placeholder="Paste the text behind the QR code"
              placeholderTextColor={colors.muted}
              multiline
              style={[type.body, styles.input]}
              accessibilityLabel="QR code text"
            />
            {!check.valid && text.length > 0 ? (
              <Text style={[type.muted, styles.error]}>{check.reason}</Text>
            ) : null}
          </View>
        ) : null}

        {mode === "scan" ? scanner() : null}

        {sent ? (
          <View style={styles.sentRow}>
            <PixelIcon name="check" size={16} color={colors.text} />
            <Text style={type.bodyMedium}>QR code sent</Text>
          </View>
        ) : null}

        {error ? <Text style={[type.muted, styles.error]}>{error}</Text> : null}

        <RecipientPicker
          selected={recipient}
          onSelect={setRecipient}
          disabled={sending}
        />

        <View style={styles.modeRow}>
          <Text
            onPress={() => {
              const next = mode === "manual" ? "scan" : "manual";
              if (next === "scan") scanLock.current = false;
              setMode(next);
              setSent(false);
            }}
            accessibilityRole="button"
            style={[type.label, styles.modeLink]}
          >
            {mode === "manual" ? "SCAN INSTEAD" : "PASTE TEXT INSTEAD"}
          </Text>
          {mode !== "scan" ? (
            <Text
              onPress={reset}
              accessibilityRole="button"
              style={[type.label, styles.modeLink]}
            >
              CLEAR
            </Text>
          ) : null}
        </View>

        <Text style={[type.muted, styles.note]}>
          Only the text inside the code travels. The other side rebuilds the
          same QR code, so metro, cinema and boarding passes all work.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        <AppButton
          label={sending ? "Sending..." : "Send code"}
          onPress={send}
          loading={sending}
          disabled={!check.valid || !recipient?.number}
        />
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
    gap: space.lg,
  },
  viewfinder: {
    height: 260,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: colors.panel,
  },
  fill: {
    flex: 1,
  },
  centered: {
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.lg,
  },
  review: {
    gap: space.sm,
  },
  codeBox: {
    alignSelf: "center",
    padding: space.md,
    backgroundColor: "#ffffff",
    borderRadius: radius,
  },
  break: {
    flexWrap: "wrap",
  },
  manual: {
    gap: space.sm,
  },
  input: {
    minHeight: 96,
    textAlignVertical: "top",
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  modeRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  modeLink: {
    paddingVertical: space.sm,
  },
  sentRow: {
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
  center: {
    textAlign: "center",
  },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
});
