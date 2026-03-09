import { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { router, useLocalSearchParams } from "expo-router";
import AppButton from "../../components/AppButton";
import AppHeader from "../../components/AppHeader";
import PixelIcon from "../../components/PixelIcon";
import { colors, radius, space, type } from "../../lib/theme";
import { buildRequestLink, parseUpiLink, validateAmount } from "../../lib/upi";

export default function AmountScreen() {
  const { url } = useLocalSearchParams();
  const link = typeof url === "string" ? url : "";
  const parsed = useMemo(() => parseUpiLink(link), [link]);
  const [amount, setAmount] = useState("");

  const hasAmountInLink = parsed.valid && parsed.am != null;
  const check = validateAmount(amount, parsed.mam);
  const willStripSignature = parsed.valid && parsed.signed && !hasAmountInLink;

  const goBack = () => {
    if (router.canGoBack()) router.back();
    else router.replace("/");
  };

  const continueToRecipients = () => {
    if (!check.valid) return;
    const { link: requestLink } = buildRequestLink(link, check.amount);
    router.push({ pathname: "/recipients", params: { link: requestLink } });
  };

  if (!parsed.valid) {
    return (
      <SafeAreaView style={styles.screen} edges={["bottom"]}>
        <AppHeader title="Amount" onBack={goBack} />
        <View style={styles.invalid}>
          <PixelIcon name="shield" size={24} color={colors.muted} />
          <Text style={[type.body, styles.center]}>{parsed.reason}</Text>
          <AppButton label="Scan again" onPress={() => router.replace("/")} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.screen} edges={["bottom"]}>
      <AppHeader title="Amount" onBack={goBack} />
      <KeyboardAvoidingView
        style={styles.screen}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.payee}>
            <Text style={type.label}>REQUESTING FROM</Text>
            <Text style={type.bodyMedium} numberOfLines={1}>
              {parsed.pn || parsed.pa}
            </Text>
            <Text style={type.muted} numberOfLines={1}>
              {parsed.pa}
            </Text>
          </View>

          <View style={styles.amountBlock}>
            <Text style={[type.label, styles.amountLabel]}>AMOUNT</Text>
            {hasAmountInLink ? (
              <View style={styles.readonlyRow}>
                <Text style={styles.currency}>₹</Text>
                <Text style={type.amount}>{parsed.am}</Text>
              </View>
            ) : (
              <View style={styles.inputRow}>
                <Text style={styles.currency}>₹</Text>
                <TextInput
                  value={amount}
                  onChangeText={setAmount}
                  placeholder="0"
                  placeholderTextColor={colors.muted}
                  style={[type.amount, styles.input]}
                  keyboardType="decimal-pad"
                  autoFocus
                  maxLength={12}
                  accessibilityLabel="Amount in rupees"
                />
              </View>
            )}

            <View style={styles.rule} />

            {parsed.mam != null ? (
              <Text style={type.muted}>Minimum amount is ₹{parsed.mam}</Text>
            ) : null}

            {!hasAmountInLink && amount.length > 0 && !check.valid ? (
              <Text style={[type.muted, styles.errorText]}>{check.reason}</Text>
            ) : null}

            {willStripSignature ? (
              <View style={styles.notice}>
                <PixelIcon name="shield" size={16} color={colors.muted} />
                <Text style={[type.muted, styles.noticeText]}>
                  Your UPI app may ask you to verify this request.
                </Text>
              </View>
            ) : null}
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <AppButton
            label="Continue"
            onPress={continueToRecipients}
            disabled={!hasAmountInLink && !check.valid}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flexGrow: 1,
    padding: space.lg,
    gap: space.xl,
  },
  payee: {
    gap: space.xs,
    paddingBottom: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  amountBlock: {
    gap: space.md,
  },
  amountLabel: {
    marginBottom: space.xs,
  },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  readonlyRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
  },
  currency: {
    fontFamily: type.amount.fontFamily,
    fontSize: 28,
    color: colors.muted,
  },
  input: {
    flex: 1,
    padding: 0,
    color: colors.text,
  },
  rule: {
    height: 1,
    backgroundColor: colors.line,
  },
  errorText: {
    color: colors.danger,
  },
  notice: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radius,
  },
  noticeText: {
    flex: 1,
  },
  footer: {
    padding: space.lg,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  invalid: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: space.lg,
    padding: space.xl,
  },
  center: {
    textAlign: "center",
  },
});
