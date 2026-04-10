import { useCallback, useEffect, useState } from "react";
import {
  AppState,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import AppButton from "../components/AppButton";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import Loading from "../components/Loading";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";
import { getPermissionSnapshot, needsSetup } from "../lib/permissions";
import { encodeLinkParam, normalizeAmount, parseUpiLink } from "../lib/upi";

export default function ScannerScreen() {
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [facing, setFacing] = useState("back");
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState(null);
  const [askingCamera, setAskingCamera] = useState(false);
  const [setup, setSetup] = useState(null);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setError(null);

      let active = true;
      getPermissionSnapshot()
        .then((snapshot) => {
          if (active) setSetup(snapshot);
        })
        .catch(() => {});

      return () => {
        active = false;
      };
    }, []),
  );

  // Notification-listener and camera access are granted in system settings;
  // refresh when the app comes back so the banner and camera panel agree.
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (next) => {
      if (next === "active") {
        getPermission().catch(() => {});
        getPermissionSnapshot()
          .then((snapshot) => setSetup(snapshot))
          .catch(() => {});
      }
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
      setSetup(await getPermissionSnapshot());
    } catch {
      // The settings screen can fail to open; the button stays available.
    } finally {
      setAskingCamera(false);
    }
  };

  const handleScan = ({ data }) => {
    setScanned(true);
    const parsed = parseUpiLink(data);
    if (!parsed.valid) {
      setError(parsed.reason);
      return;
    }

    const link = parsed.raw.trim();
    if (normalizeAmount(parsed.am) != null) {
      router.push({
        pathname: "/recipients",
        params: { link: encodeLinkParam(link) },
      });
    } else {
      router.push({
        pathname: "/pay/[url]",
        params: { url: encodeLinkParam(link) },
      });
    }
  };

  const resetScanner = () => {
    setError(null);
    setScanned(false);
  };

  const setupNeeded = needsSetup(setup);

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="off-txt"
        right={
          <View style={styles.headerActions}>
            <IconButton
              icon="shield"
              label="Permissions"
              onPress={() => router.push("/permissions")}
            />
            <IconButton
              icon="send"
              label="Send something"
              onPress={() => router.push("/share")}
            />
            <IconButton
              icon="inbox"
              label="Open shared items"
              onPress={() => router.push("/transfers")}
            />
          </View>
        }
      />

      {setupNeeded ? (
        <Pressable
          onPress={() => router.push("/permissions")}
          accessibilityRole="button"
          accessibilityLabel="Finish permission setup"
          style={({ pressed }) => [
            styles.setupBanner,
            pressed && styles.setupBannerPressed,
          ]}
        >
          <PixelIcon name="shield" size={16} color={colors.muted} />
          <View style={styles.setupText}>
            <Text style={type.bodyMedium}>Finish setup</Text>
            <Text style={type.muted} numberOfLines={2}>
              Message and notification access are still off, so incoming items
              will not show up on their own.
            </Text>
          </View>
          <Text style={type.label}>FIX</Text>
        </Pressable>
      ) : null}

      <View style={styles.body}>
        {!permission ? (
          <View style={styles.viewfinder}>
            <Loading label="Checking camera" style={styles.fill} />
          </View>
        ) : !permission.granted ? (
          <View style={styles.permission}>
            <PixelIcon name="shield" size={24} color={colors.muted} />
            <Text style={[type.body, styles.center]}>
              Camera access is needed to read a UPI QR code.
            </Text>
            <AppButton
              label={
                permission.canAskAgain === false
                  ? "Open settings"
                  : "Allow camera"
              }
              loading={askingCamera}
              onPress={askCamera}
            />
          </View>
        ) : (
          <View style={styles.viewfinder}>
            <CameraView
              style={StyleSheet.absoluteFill}
              facing={facing}
              barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
              onBarcodeScanned={scanned ? undefined : handleScan}
            />
            <View pointerEvents="none" style={styles.reticle} />
            <View style={styles.cameraControls}>
              <IconButton
                icon="reload"
                label="Switch camera"
                onPress={() =>
                  setFacing((current) => (current === "back" ? "front" : "back"))
                }
                style={styles.cameraButton}
              />
            </View>
          </View>
        )}

        {error ? (
          <View style={styles.banner}>
            <PixelIcon name="shield" size={16} color={colors.danger} />
            <Text style={[type.muted, styles.bannerText]}>{error}</Text>
            <IconButton
              icon="close"
              size={16}
              label="Dismiss"
              onPress={resetScanner}
            />
          </View>
        ) : null}

        <Text style={[type.muted, styles.hint]}>
          Point the camera at a UPI QR code. The amount you type is carried in
          the request link.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  setupBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    marginHorizontal: space.lg,
    marginTop: space.md,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  setupBannerPressed: {
    backgroundColor: colors.line,
  },
  setupText: {
    flex: 1,
    gap: 2,
  },
  body: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
  },
  fill: {
    flex: 1,
  },
  viewfinder: {
    flex: 1,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    overflow: "hidden",
    backgroundColor: colors.panel,
  },
  reticle: {
    position: "absolute",
    top: "50%",
    left: "50%",
    width: 220,
    height: 220,
    marginTop: -110,
    marginLeft: -110,
    borderWidth: 1,
    borderColor: colors.line,
  },
  cameraControls: {
    position: "absolute",
    bottom: space.lg,
    left: 0,
    right: 0,
    alignItems: "center",
  },
  cameraButton: {
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  permission: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
    backgroundColor: colors.panel,
  },
  center: {
    textAlign: "center",
  },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingLeft: space.md,
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius,
  },
  bannerText: {
    flex: 1,
    paddingVertical: space.sm,
  },
  hint: {
    paddingBottom: space.sm,
  },
});
