import { useMemo, useState } from "react";
import {
  ActivityIndicator,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import PixelIcon from "../../components/PixelIcon";
import RecipientPicker from "../../components/RecipientPicker";
import {
  TARGET_BYTES,
  buildImageTransfer,
  compressToTarget,
  formatBytes,
} from "../../lib/image";
import { ensureSendPermission, sendParts } from "../../lib/sms";
import { colors, radius, space, type } from "../../lib/theme";

export default function ImageShareScreen() {
  const [recipient, setRecipient] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [working, setWorking] = useState(false);
  const [status, setStatus] = useState(null);
  const [error, setError] = useState(null);

  const parts = useMemo(() => (photo ? buildImageTransfer(photo.base64) : null), [photo]);

  const pick = async () => {
    setError(null);
    setStatus(null);

    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        quality: 1,
        allowsEditing: false,
      });
      if (result.canceled || !result.assets?.[0]?.uri) return;

      setWorking(true);
      setPhoto(null);
      const compressed = await compressToTarget(result.assets[0].uri, TARGET_BYTES);
      setPhoto(compressed);
      setStatus(
        compressed.bytes <= TARGET_BYTES
          ? "compressed"
          : "compressed-heavy",
      );
    } catch (failure) {
      setError(failure?.message ?? "Could not read that picture.");
    } finally {
      setWorking(false);
    }
  };

  const send = async () => {
    if (!parts || !recipient?.number) return;

    setWorking(true);
    setError(null);

    try {
      if (!(await ensureSendPermission())) {
        setError("SMS permission is needed to send silently.");
        return;
      }

      const result = await sendParts(recipient.number, parts.parts);
      if (result.sent) {
        setStatus("sent");
        setPhoto(null);
      } else {
        setError(result.reason ?? "The message did not leave the phone.");
      }
    } catch (failure) {
      setError(failure?.message ?? "Sending failed.");
    } finally {
      setWorking(false);
    }
  };

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/share");
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Picture" onBack={goBack} />

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.preview}>
          {photo ? (
            <Image
              source={{ uri: `data:image/jpeg;base64,${photo.base64}` }}
              style={styles.image}
              resizeMode="contain"
              accessibilityLabel="Compressed picture preview"
            />
          ) : (
            <View style={styles.placeholder}>
              {working ? (
                <ActivityIndicator color={colors.muted} />
              ) : (
                <>
                  <PixelIcon name="image" size={24} color={colors.muted} />
                  <Text style={[type.muted, styles.center]}>
                    Pick a photo. It is turned greyscale, posterised and shrunk
                    before it leaves the phone.
                  </Text>
                </>
              )}
            </View>
          )}
        </View>

        {photo ? (
          <View style={styles.facts}>
            <Fact label="SIZE" value={formatBytes(photo.bytes)} />
            <Fact label="PIXELS" value={`${photo.width} × ${photo.height}`} />
            <Fact label="SMS PARTS" value={String(photo.parts)} />
          </View>
        ) : null}

        {status === "compressed-heavy" && photo ? (
          <Text style={[type.muted, styles.warn]}>
            This photo is still {formatBytes(photo.bytes)}. It will go out as{" "}
            {photo.parts} SMS parts, which some carriers throttle.
          </Text>
        ) : null}

        {status === "sent" ? (
          <View style={styles.sentRow}>
            <PixelIcon name="check" size={16} color={colors.text} />
            <Text style={type.bodyMedium}>Picture sent</Text>
          </View>
        ) : null}

        {error ? <Text style={[type.muted, styles.error]}>{error}</Text> : null}

        <RecipientPicker
          selected={recipient}
          onSelect={setRecipient}
          disabled={working}
        />

        <Text style={[type.muted, styles.note]}>
          Greyscale and posterising are done on the phone. A 3 MB photo usually
          lands under {formatBytes(TARGET_BYTES)}, about{" "}
          {Math.ceil(TARGET_BYTES / 100)} SMS parts.
        </Text>
      </ScrollView>

      <View style={styles.footer}>
        {photo ? (
          <AppButton
            label={working ? "Sending..." : `Send ${photo.parts} parts`}
            onPress={send}
            loading={working}
            disabled={!recipient?.number}
          />
        ) : (
          <AppButton
            label={working ? "Compressing..." : "Choose photo"}
            onPress={pick}
            loading={working}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

function Fact({ label, value }) {
  return (
    <View style={styles.fact}>
      <Text style={type.label}>{label}</Text>
      <Text style={type.bodyMedium}>{value}</Text>
    </View>
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
  preview: {
    height: 220,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
    overflow: "hidden",
  },
  image: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.md,
    padding: space.lg,
  },
  center: {
    textAlign: "center",
  },
  facts: {
    flexDirection: "row",
    gap: space.sm,
  },
  fact: {
    flex: 1,
    gap: 2,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  warn: {
    color: colors.text,
  },
  error: {
    color: colors.danger,
  },
  sentRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
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
