import { StatusBar } from "expo-status-bar";
import {
  Alert,
  Button,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Ionicons from "@expo/vector-icons/Ionicons";
import { CameraView, CameraType, useCameraPermissions } from "expo-camera";
import { useState } from "react";
export default function ScannerScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState("back");
  const [scanned, setScanned] = useState(false);

  if (!permission) {
    return <View />;
  }
  if (!permission.granted) {
    return (
      <View style={styles.centeredContainer}>
        <Text>Grant camera access to take photo</Text>
        <Button
          style={styles.text}
          onPress={requestPermission}
          title="grant camera access"
        />
      </View>
    );
  }
  function toggleCameraFace() {
    setFacing((current) => (current === "back" ? "front" : "back"));
  }

  const handleBarcodeScanned = ({ type, data }) => {
    setScanned(true);
    Alert.alert("qr scaned", `type: ${type}\n data: ${data}`, [{ text: "ok" }]);
    console.log(data);
  };
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <CameraView
          facing={facing}
          style={styles.camera}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
          onBarcodeScanned={scanned ? undefined : handleBarcodeScanned}
        >
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.button} onPress={toggleCameraFace}>
              <Ionicons name="sync" size={30} color="black" />
            </TouchableOpacity>
            {scanned && (
              <TouchableOpacity
                style={styles.button}
                onPress={() => setScanned(false)}
              >
                <Ionicons name="refresh" size={24} color="black" />
              </TouchableOpacity>
            )}
          </View>
        </CameraView>
        <StatusBar style="auto" />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  camera: { flex: 1, alignItems: "stretch" },
  safeArea: {
    flex: 1,
    backgroundColor: "#fff",
  },
  container: {
    flex: 1,
  },
  centeredContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonContainer: {
    position: "absolute",
    bottom: 40,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 20,
  },
  button: {
    backgroundColor: "yellow",
    padding: 8,
    borderRadius: 40,
  },
  text: {
    fontSize: 18,
    fontWeight: "500",
    color: "#333",
  },
});
