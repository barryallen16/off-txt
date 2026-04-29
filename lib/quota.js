// TRAI allows 100 free outgoing SMS per SIM per calendar day. Every send in
// the app goes through lib/sms.js, so one counter is enough. The counter resets
// lazily on the first read after local midnight.

import { useEffect, useState } from "react";
import { DeviceEventEmitter } from "react-native";
import { getMeta, setMeta } from "./db";

export const SMS_DAILY_LIMIT = 100;
export const QUOTA_CHANGED_EVENT = "offtxt:quota-changed";

const USED_KEY = "sms_sent_today";
const DATE_KEY = "sms_quota_date";

/** Local calendar date, not UTC, so midnight matches the phone. */
export function quotaDay(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function readUsed() {
  const today = quotaDay();
  const stored = getMeta(DATE_KEY);

  if (stored !== today) {
    setMeta(DATE_KEY, today);
    setMeta(USED_KEY, "0");
    return 0;
  }

  return Math.max(0, Math.floor(Number(getMeta(USED_KEY)) || 0));
}

/**
 * @returns {{ limit: number, used: number, remaining: number, date: string }}
 */
export function getSmsQuota() {
  const used = readUsed();
  return {
    limit: SMS_DAILY_LIMIT,
    used,
    remaining: Math.max(0, SMS_DAILY_LIMIT - used),
    date: quotaDay(),
  };
}

/** Add segments after the radio accepted them. */
export function recordSmsUsage(count) {
  const segments = Math.max(0, Math.floor(Number(count) || 0));
  if (segments > 0) {
    const used = readUsed() + segments;
    setMeta(USED_KEY, String(used));
    DeviceEventEmitter.emit(QUOTA_CHANGED_EVENT);
  }
  return getSmsQuota();
}

/**
 * Live counter for the header and the share screens. Rechecks once a minute so
 * a midnight rollover appears without a restart.
 */
export function useSmsQuota() {
  const [quota, setQuota] = useState(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      try {
        if (active) setQuota(getSmsQuota());
      } catch {
        if (active) setQuota(null);
      }
    };

    refresh();
    const subscription = DeviceEventEmitter.addListener(
      QUOTA_CHANGED_EVENT,
      refresh,
    );
    const timer = setInterval(refresh, 60 * 1000);

    return () => {
      active = false;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  return quota;
}
