import { useCallback, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { router, useFocusEffect } from "expo-router";
import AppButton from "../components/AppButton";
import AppHeader from "../components/AppHeader";
import IconButton from "../components/IconButton";
import PixelIcon from "../components/PixelIcon";
import { colors, radius, space, type } from "../lib/theme";
import { parseUpiLink } from "../lib/upi";

export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState("back");
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState(null);

  useFocusEffect(
    useCallback(() => {
      setScanned(false);
      setError(null);
    }, []),
  );

  const handleScan = ({ data }) => {
    setScanned(true);
    const parsed = parseUpiLink(data);
    if (!parsed.valid) {
      setError(parsed.reason);
      return;
    }

    const link = parsed.raw.trim();
    if (parsed.am != null) {
      router.push({ pathname: "/recipients", params: { link } });
    } else {
      router.push({ pathname: "/pay/[url]", params: { url: link } });
    }
  };

  const resetScanner = () => {
    setError(null);
    setScanned(false);
  };

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader
        title="off-txt"
        right={
          <View style={styles.headerActions}>
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

      <View style={styles.body}>
        {!permission ? (
          <View style={styles.viewfinder} />
        ) : !permission.granted ? (
          <View style={styles.permission}>
            <PixelIcon name="shield" size={24} color={colors.muted} />
            <Text style={[type.body, styles.center]}>
              Camera access is needed to read a UPI QR code.
            </Text>
            <AppButton label="Allow camera" onPress={requestPermission} />
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
    gap: space.xs,
  },
  body: {
    flex: 1,
    padding: space.lg,
    gap: space.md,
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
