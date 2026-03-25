import { useEffect, useMemo, useState } from "react";

export function toSentence(value) {
  if (!value) {
    return "Guest";
  }
  return value
    .split("_")
    .map((part) => part[0].toUpperCase() + part.slice(1))
    .join(" ");
}

export function formatDateTime(value) {
  if (!value) {
    return "--";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "--";
  }
  return date.toLocaleString();
}

export function formatStatus(status) {
  return status ? status[0].toUpperCase() + status.slice(1) : "Unknown";
}

export function useCountdown(targetDate) {
  const countdown = useCountdownParts(targetDate);
  return countdown.display;
}

export function useCountdownParts(targetDate) {
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!targetDate) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        display: "Not available",
        isComplete: false,
      };
    }
    const target = new Date(targetDate).getTime();
    if (Number.isNaN(target)) {
      return {
        days: 0,
        hours: 0,
        minutes: 0,
        seconds: 0,
        display: "Not available",
        isComplete: false,
      };
    }
    const rawDiff = target - tick;
    const diff = Math.max(0, rawDiff);
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return {
      days,
      hours,
      minutes,
      seconds,
      display: `${days}d ${hours}h ${minutes}m ${seconds}s`,
      isComplete: rawDiff <= 0,
    };
  }, [targetDate, tick]);
}
