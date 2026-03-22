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
  const [tick, setTick] = useState(Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setTick(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  return useMemo(() => {
    if (!targetDate) {
      return "Not available";
    }
    const target = new Date(targetDate).getTime();
    if (Number.isNaN(target)) {
      return "Not available";
    }
    const diff = Math.max(0, target - tick);
    const days = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const minutes = Math.floor((diff % 3600000) / 60000);
    const seconds = Math.floor((diff % 60000) / 1000);
    return `${days}d ${hours}h ${minutes}m ${seconds}s`;
  }, [targetDate, tick]);
}
