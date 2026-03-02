import { StatusBar } from "expo-status-bar";
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  KeyboardAvoidingView,
  Pressable,
  Image,
  ScrollView,
  Platform,
} from "react-native";
import Ionicons from "@expo/vector-icons/Ionicons";
import { SafeAreaView } from "react-native-safe-area-context";
import * as SplashScreen from "expo-splash-screen";
import { useEffect, useState } from "react";
import { useFonts } from "expo-font";
import OffTxtSvg from "../../assets/off-txt-img.svg";
import { useLocalSearchParams } from "expo-router";
import { router } from "expo-router";

export default function PaymentScreen() {
  SplashScreen.preventAutoHideAsync();
  const { baseUrl } = useLocalSearchParams();
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [loaded, error] = useFonts({
    TitleFont: require("../../assets/fonts/BebasNeue-Regular.ttf"),
    BodyFont: require("../../assets/fonts/UbuntuMono-Regular.ttf"),
  });

  useEffect(() => {
    if (loaded || error) {
      SplashScreen.hideAsync();
    }
  }, [loaded, error]);

  if (!loaded && !error) {
    return null;
  }
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "red" }}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <OffTxtSvg width={32} style={styles.txtLogo} />
          <Text
            style={{
              fontWeight: "condensedBold",
              fontFamily: "BodyFont",
              fontSize: 16,
            }}
          >
            Requesting Money for
            <Text style={{ fontWeight: "bold" }}> 6369605616</Text>
          </Text>
          <View style={styles.amountContainer}>
            <Text style={styles.rupeesSymbol}>₹</Text>
            <TextInput
              value={amount}
              placeholder="0"
              style={styles.textinput}
              onChangeText={setAmount}
              autoCorrect={false}
              keyboardType="numeric"
            />
          </View>

          <TextInput
            value={note}
            placeholder="note"
            style={{
              ...styles.textinput,
              fontSize: 20,
              backgroundColor: "yellow",
              borderRadius: 8,
              paddingVertical: 8,
              paddingHorizontal: 8,
            }}
            onChangeText={setNote}
            keyboardType="default"
          />
          <StatusBar style="auto" />

          {/* <View
        style={{
          backgroundColor: "yellow",
          padding: 8,
          borderRadius: 60,
          flexDirection: "row",
          gap: 4,

          alignItems: "center",
        }}
      >
        <Ionicons name="scan" size={24} color="black" />
        <Text style={{ fontWeight: "bold" }}>Scan</Text>
      </View> */}
        </ScrollView>
        <Pressable
          style={{
            backgroundColor: "yellow",
            padding: 8,
            borderRadius: 16,
            alignSelf: "flex-end",
            marginRight: 16,
            marginBottom: 8,
          }}
          onPress={() => {
            router.push({
              pathname: "ContactsScreen",
              params: { fullPayUrl: baseUrl + "&am=" + amount },
            });
          }}
        >
          <Ionicons name="arrow-forward" size={30} color="black" />
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  txtLogo: {
    flex: 1,
    backgroundColor: "red",
  },
  container: {
    flex: 1,
    backgroundColor: "red",
  },
  amountContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  textinput: {
    alignItems: "center",
    borderColor: "#0e0e0e",
    fontFamily: "TitleFont",
    fontSize: 80,
  },
  titleText: {
    fontFamily: "TitleFont",
    fontSize: 40,
  },
  rupeesSymbol: {
    fontFamily: "TitleFont",
    fontSize: 80,
    marginRight: 8,
  },
});
